export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

/* =========================
   Config
   ========================= */
const CONFIG = {
  TIMEOUT_MS: 10000,
  COOKIE_MAX_AGE: 31536000, // 1 year
  VALID_VARIANTS: ['A', 'B'],
  MAX_COOKIE_SIZE: 8192,

  // Registry caching & KV behavior
  REGISTRY_CACHE_TTL: 300, // seconds
  KV_TIMEOUT_MS: 5000,

  // Edge cache defaults for HTML (anonymous only)
  EDGE_DEFAULT_TTL: 300, // seconds

  // Only cache GET/HEAD
  CACHE_ONLY_METHODS: new Set(['GET', 'HEAD']),

  // Query normalization
  STRIP_UTM_PARAMS: true,
  UTM_PARAMS: new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi'
  ]),

  // Warm a GET in the background when HEAD misses
  WARM_ON_HEAD_MISS: true,

  // Path TTLs (first match wins)
  PATH_TTLS: [
    {test: (p) => p === '/' || p === '/index.html', ttl: 600},
    {test: (p) => p.startsWith('/blog/'), ttl: 180},
  ],

  // Status TTL overrides (0 => fall back to path/default; non-cacheables listed below)
  STATUS_TTL_OVERRIDES: new Map([
    [200, 0],
    [301, 300],
    [302, 60],
    [404, 60],
  ]),

  // Which statuses may be cached at all
  CACHEABLE_STATUSES: new Set([200, 301, 302, 404]),
};

/* =========================
   WordPress safety lists
   ========================= */

// Paths we always bypass
const BYPASS_PATHS = ['/wp-admin/', '/wp-json/', '/wp-login', '/wp-content/', '/wp-includes/'];

// Static assets to bypass AB logic entirely
const STATIC_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'css', 'js', 'woff', 'woff2', 'ttf', 'eot',
  'pdf', 'zip', 'ico', 'xml', 'txt', 'map', 'webm', 'mp4', 'mov', 'avi'
]);

// Cookies that mean the request is personalized (never cache)
const WP_SENSITIVE_COOKIE_PREFIXES = [
  'wordpress_logged_in_', // logged-in users (incl. admins)
  'wordpress_sec_',       // secure auth
  'wp-settings-',         // user settings
  'wp-postpass_',         // password-protected posts
  'comment_author', 'comment_author_', // commenter personalization
  'woocommerce_cart_hash',
  'woocommerce_items_in_cart',
  'wp_woocommerce_session_', 'wc_fragments_', // Woo sessions/fragments
  'wordpress_no_cache', 'wordpress_test_cookie',
];

// Query params indicating preview/customizer/editor/cart—never cache
const WP_SENSITIVE_QUERY_PARAMS = new Set([
  'preview', 'preview_id', 'preview_nonce', 'preview_time',
  'customize_changeset_uuid', 'customize_theme', 'customize_messenger_channel',
  'elementor-preview', 'elementor_library',
  'jetpack-preview',
  'add-to-cart', 'remove_item', 'undo_item', 'coupon_code', 'shipping_method',
  // any explicit no-cache bypasses you may use
  '__cf_bypass_cache', 'nonitro',
]);

/* =========================
   Caches & logging
   ========================= */

const cookieRegexCache = new Map();

let kvNamespaceAvailable = null;
let registryCache = null;
let registryCacheTime = 0;
let kvFailureCount = 0;
const KV_FAILURE_THRESHOLD = 5;

const NO_TEST_CACHE_PREFIX = 'https://internal/no-test-cache/';

function logInfo(env, ...args) {
  if (env?.DEBUG) console.log(...args);
}

function logWarn(env, ...args) {
  if (env?.DEBUG) console.warn(...args);
}

function logError(...args) {
  console.error(...args);
}

if (!CONFIG.TIMEOUT_MS) throw new Error('Invalid worker configuration');

/* =========================
   Entry
   ========================= */

async function handleRequest(request, env, ctx) {
  const start = Date.now();
  try {
    const res = await route(request, env, ctx);
    const h = new Headers(res.headers);
    h.set('X-Worker-Duration', `${Date.now() - start}ms`);
    return new Response(res.body, {status: res.status, statusText: res.statusText, headers: h});
  } catch (error) {
    logError('Worker error:', error);
    const r = new Response('Worker Error: Request Processing Failed', {status: 500});
    const h = new Headers(r.headers);
    h.set('X-Worker-Duration', `${Date.now() - start}ms`);
    if (error.name) h.set('X-Error-Name', error.name);
    if (error.message) h.set('X-Error-Message', error.message);
    return new Response(r.body, {status: r.status, statusText: r.statusText, headers: h});
  }
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const {pathname} = url;

  // Global bypasses
  if (shouldBypassProcessing(url, request, env)) {
    return fetch(request);
  }

  // WordPress personalization check — if personalized, hard bypass (read + no cache write)
  if (isPersonalizedRequest(request, url)) {
    const res = await fetch(request);
    // Add protective client caching headers to avoid intermediaries storing this
    const h = new Headers(res.headers);
    hardenPrivateCaching(h);
    return new Response(res.body, {status: res.status, statusText: res.statusText, headers: h});
  }

  // Quick “no test here” check
  const noTestCacheKey = new Request(NO_TEST_CACHE_PREFIX + pathname);
  if (await caches.default.match(noTestCacheKey)) {
    return fetch(request);
  }

  // Load registry
  const registry = await getTestRegistry(env, ctx);
  if (!registry || registry.length === 0) {
    return fetch(request);
  }

  // Match test by path
  const test = findMatchingTest(pathname, registry);
  if (!test) {
    const marker = new Response('no-test', {
      headers: {'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`, 'Content-Type': 'text/plain'}
    });
    ctx.waitUntil(caches.default.put(noTestCacheKey, marker));
    return fetch(request);
  }

  // A/B with variant-split caching (anonymous only)
  return handleABTestWithVariantCache(request, url, test, env, ctx);
}

/* =========================
   Bypass / personalization
   ========================= */

function shouldBypassProcessing(url, request, env) {
  const path = url.pathname;

  // Non-cacheable methods
  if (!CONFIG.CACHE_ONLY_METHODS.has(request.method)) return true;

  // Admin, REST, system paths
  if (BYPASS_PATHS.some(prefix => path.startsWith(prefix))) return true;

  // Static assets
  const dot = path.lastIndexOf('.');
  if (dot !== -1) {
    const ext = path.slice(dot + 1).toLowerCase();
    if (STATIC_EXTENSIONS.has(ext)) return true;
  }

  // Debug flags
  if (url.searchParams.has('__cf_bypass_cache') || url.searchParams.has('nonitro')) return true;

  // Oversized cookie header
  const cookies = request.headers.get('Cookie') || '';
  if (cookies.length > CONFIG.MAX_COOKIE_SIZE) {
    logWarn(env, 'Cookie header too large, bypassing');
    return true;
  }

  return false;
}

function isPersonalizedRequest(request, url) {
  // Sensitive query params
  for (const [k, v] of url.searchParams.entries()) {
    if (WP_SENSITIVE_QUERY_PARAMS.has(k)) return true;
    // many WP previews use preview=true
    if (k === 'preview' && v === 'true') return true;
  }

  // Sensitive cookies
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return false;

  const parts = cookieHeader.split(';').map(s => s.trim());
  for (const p of parts) {
    const [name] = p.split('=', 1);
    if (!name) continue;
    const lower = name.toLowerCase();
    for (const pref of WP_SENSITIVE_COOKIE_PREFIXES) {
      if (lower.startsWith(pref.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

function hardenPrivateCaching(headers) {
  // Ensure private/non-store to avoid downstream/shared caches storing it
  const cc = headers.get('Cache-Control') || '';
  if (!/private|no-store|no-cache/i.test(cc)) {
    headers.set('Cache-Control', 'private, no-store');
  }
  // Secondary hints
  headers.set('Vary', mergeVary(headers.get('Vary'), ['Cookie']));
}

/* =========================
   Registry (KV + Cache API)
   ========================= */

function checkKVNamespace(env) {
  if (kvNamespaceAvailable === null) {
    kvNamespaceAvailable = typeof env.AB_TESTS_KV !== 'undefined';
    if (!kvNamespaceAvailable) logWarn(env, 'KV namespace not bound - A/B testing disabled');
  }
  return kvNamespaceAvailable;
}

async function getTestRegistry(env, ctx) {
  const now = Date.now();
  if (registryCache && (now - registryCacheTime) < (CONFIG.REGISTRY_CACHE_TTL * 1000)) {
    return registryCache;
  }

  if (kvFailureCount > KV_FAILURE_THRESHOLD) {
    logWarn(env, `KV failures exceeded; using stale or empty`);
    return registryCache || [];
  }

  const cacheKey = new Request('https://internal/ab-registry-cache-v1');
  const cache = caches.default;

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const data = await cachedResponse.json();
      if (Array.isArray(data)) {
        registryCache = data;
        registryCacheTime = now;
        return data;
      }
    }
  } catch (e) {
    logWarn(null, 'Cache API read failed:', e);
  }

  try {
    if (!checkKVNamespace(env)) return [];

    const kvPromise = env.AB_TESTS_KV.get('registry', {type: 'json'});
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('KV timeout')), CONFIG.KV_TIMEOUT_MS));
    const reg = await Promise.race([kvPromise, timeout]);

    if (!reg || !Array.isArray(reg)) {
      registryCache = [];
      registryCacheTime = now;
      return [];
    }

    const valid = reg.filter(t =>
      t && typeof t.test === 'string' && typeof t.cookieName === 'string' && Array.isArray(t.paths) && t.paths.length > 0
    );

    registryCache = Object.freeze(valid.map(t => Object.freeze({...t})));
    registryCacheTime = now;

    const resp = new Response(JSON.stringify(valid), {
      headers: {
        'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}, stale-while-revalidate=${CONFIG.REGISTRY_CACHE_TTL}`,
        'Content-Type': 'application/json',
        'CDN-Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`
      }
    });
    ctx.waitUntil(cache.put(cacheKey, resp));

    kvFailureCount = 0;
    return valid;

  } catch (e) {
    kvFailureCount++;
    logError('KV registry fetch failed:', e);
    return registryCache || [];
  }
}

function findMatchingTest(pathname, registry) {
  return registry.find(test =>
    Array.isArray(test.paths) &&
    test.paths.some(path => pathname === path || pathname.startsWith((path.endsWith('/') ? path : path + '/')))
  );
}

/* =========================
   A/B with variant-split cache (anonymous only)
   ========================= */

async function handleABTestWithVariantCache(request, url, test, env, ctx) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    // Extra guard: if this request is personalized, hard bypass even here
    if (isPersonalizedRequest(request, url)) {
      const res = await fetch(request, {signal: controller.signal});
      const h = new Headers(res.headers);
      hardenPrivateCaching(h);
      return new Response(res.body, {status: res.status, statusText: res.statusText, headers: h});
    }

    // Variant selection (URL force -> cookie -> deterministic)
    let variant = getVariantFromRequest(request, test.cookieName, test.test);
    if (!variant) variant = await generateVariant(request);

    // Build a normalized variant-specific cache key (ALWAYS GET for Cache API)
    const cache = caches.default;
    const cacheKeyUrl = new URL(url.toString());

    // Strip UTM/ads params
    if (CONFIG.STRIP_UTM_PARAMS && cacheKeyUrl.search) {
      for (const key of Array.from(cacheKeyUrl.searchParams.keys())) {
        if (CONFIG.UTM_PARAMS.has(key)) cacheKeyUrl.searchParams.delete(key);
      }
    }

    // Strip forcing params so forced & natural share one entry
    cacheKeyUrl.searchParams.delete(test.cookieName);
    if (test.test) {
      for (const key of Array.from(cacheKeyUrl.searchParams.keys())) {
        if (key.toLowerCase() === String(test.test).toLowerCase()) cacheKeyUrl.searchParams.delete(key);
      }
    }

    // Internal variant splitter (only for Cache API key)
    cacheKeyUrl.searchParams.set('__ab_variant', variant);

    const getCacheKey = new Request(cacheKeyUrl.toString(), {
      method: 'GET',
      headers: {'Accept': request.headers.get('Accept') || ''}
    });

    // Try Cache API
    const cached = await cache.match(getCacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      attachABHeaders(h, test, variant, env);
      setABCookie(h, test.cookieName, variant);
      h.set('X-Variant-Cache', 'hit');
      h.set('X-Variant-Cache-Key', getCacheKey.url);

      if (request.method === 'HEAD') {
        return new Response(null, {status: cached.status, statusText: cached.statusText, headers: h});
      }
      return new Response(cached.body, {status: cached.status, statusText: cached.statusText, headers: h});
    }

    // Cache miss → fetch origin with variant hints
    const headers = new Headers(request.headers);
    headers.set('X-' + test.cookieName, variant);
    headers.set('X-AB-Variant', variant);

    // Forward AB cookie to origin if it renders by cookie
    const existingCookie = headers.get('Cookie') || '';
    headers.set('Cookie', mergeCookie(existingCookie, `${test.cookieName}=${variant}`));

    const originReq = new Request(request, {headers});
    const originRes = await fetch(originReq, {signal: controller.signal});

    // If origin sets cookies or asks for private/no-store, DO NOT CACHE this response
    const originSetCookie = originRes.headers.get('Set-Cookie');
    const originCC = originRes.headers.get('Cache-Control') || '';
    const originPrivate = /private|no-store|no-cache/i.test(originCC);

    // Compute TTL for anonymous cache
    const ttl = getEdgeTTL(url.pathname, originRes.status);

    // Prepare client headers
    const clientHeaders = new Headers(originRes.headers);
    attachABHeaders(clientHeaders, test, variant, env);
    setABCookie(clientHeaders, test.cookieName, variant);
    clientHeaders.set('X-Variant-Cache', 'miss');
    clientHeaders.set('X-Variant-Cache-Key', getCacheKey.url);

    const isGET = request.method === 'GET';

    // Clone BEFORE consuming
    const resForCache = originRes.clone();
    const resForClient = originRes;

    // Cache only if:
    // - GET
    // - cacheable status & ttl > 0
    // - request is NOT personalized (already ensured)
    // - origin did NOT set any cookie on this response
    // - origin did NOT mark as private/no-store/no-cache
    if (
      isGET &&
      CONFIG.CACHEABLE_STATUSES.has(resForCache.status) &&
      ttl > 0 &&
      !originSetCookie &&
      !originPrivate
    ) {
      const cacheHeaders = new Headers(clientHeaders);
      cacheHeaders.delete('Set-Cookie'); // never cache Set-Cookie
      cacheHeaders.set('Cache-Control', ensureSMaxAge(cacheHeaders.get('Cache-Control'), ttl));
      cacheHeaders.set('CDN-Cache-Control', `max-age=${ttl}`);

      const cacheableRes = new Response(resForCache.body, {
        status: resForCache.status,
        statusText: resForCache.statusText,
        headers: cacheHeaders
      });

      await cache.put(getCacheKey, cacheableRes);
    } else if (request.method === 'HEAD' && CONFIG.WARM_ON_HEAD_MISS && ttl > 0 && !originSetCookie && !originPrivate) {
      // Optional: warm GET in background if safe to cache
      ctx.waitUntil((async () => {
        try {
          const warmReq = new Request(new URL(url.toString()).toString(), {method: 'GET', headers});
          const warmRes = await fetch(warmReq, {signal: controller.signal});
          if (CONFIG.CACHEABLE_STATUSES.has(warmRes.status)) {
            const h2 = new Headers(warmRes.headers);
            if (!h2.get('Set-Cookie') && !/(private|no-store|no-cache)/i.test(h2.get('Cache-Control') || '')) {
              h2.delete('Set-Cookie');
              h2.set('Cache-Control', ensureSMaxAge(h2.get('Cache-Control'), ttl));
              h2.set('CDN-Cache-Control', `max-age=${ttl}`);
              await caches.default.put(getCacheKey, new Response(warmRes.body, {
                status: warmRes.status,
                statusText: warmRes.statusText,
                headers: h2
              }));
            }
          }
        } catch (e) {
          logWarn(env, 'HEAD warm failed:', e);
        }
      })());
    }

    // If origin looked private or set a cookie, also harden client response
    if (originSetCookie || originPrivate) {
      hardenPrivateCaching(clientHeaders);
    }

    // Return to client (body for GET, header-only for HEAD)
    return new Response(isGET ? resForClient.body : null, {
      status: resForClient.status,
      statusText: resForClient.statusText,
      headers: clientHeaders
    });

  } catch (error) {
    if (error.name === 'AbortError') {
      logWarn(env, 'Request timeout, falling back to origin');
      return fetch(request);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =========================
   Helpers
   ========================= */

function attachABHeaders(h, test, variant, env) {
  h.set('X-Worker-Active', 'true');
  h.set('X-AB-Test', test.test);
  h.set('X-AB-Variant', variant);
  if (env?.DEBUG) h.set('X-AB-Debug-Server-Side', 'true');
}

function setABCookie(h, cookieName, variant) {
  h.append(
    'Set-Cookie',
    `${cookieName}=${variant}; Path=/; Max-Age=${CONFIG.COOKIE_MAX_AGE}; SameSite=Lax; Secure; HttpOnly`
  );
}

function mergeCookie(existing, addition) {
  if (!existing) return addition;
  const [name] = addition.split('=', 1);
  const filtered = existing
    .split(';')
    .map(s => s.trim())
    .filter(kv => kv && !kv.startsWith(name + '='));
  filtered.push(addition);
  return filtered.join('; ');
}

function getVariantFromRequest(request, cookieName, altParamName) {
  const url = new URL(request.url);

  // URL forcing via cookieName
  let forced = url.searchParams.get(cookieName);
  if (CONFIG.VALID_VARIANTS.includes(forced)) return forced;

  // URL forcing via test name (case-insensitive)
  if (altParamName) {
    forced = url.searchParams.get(altParamName);
    if (CONFIG.VALID_VARIANTS.includes(forced)) return forced;
    for (const [k, v] of url.searchParams.entries()) {
      if (k.toLowerCase() === String(altParamName).toLowerCase() && CONFIG.VALID_VARIANTS.includes(v)) {
        return v;
      }
    }
  }

  // Cookie
  const cookies = request.headers.get('Cookie') || '';
  if (cookies) {
    if (cookieRegexCache.size > 50) cookieRegexCache.clear();
    if (!cookieRegexCache.has(cookieName)) {
      cookieRegexCache.set(cookieName, new RegExp(`(?:^|; )${cookieName}=([AB])(?:;|$)`));
    }
    const re = cookieRegexCache.get(cookieName);
    const m = cookies.match(re);
    if (m && CONFIG.VALID_VARIANTS.includes(m[1])) return m[1];
  }

  return null;
}

async function generateVariant(request) {
  const ip = request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '127.0.0.1';
  const ua = (request.headers.get('User-Agent') || '').slice(0, 80);
  const input = `${ip}|${ua}`;

  try {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
    return (new Uint8Array(buf)[0] % 2) === 0 ? 'A' : 'B';
  } catch {
    let h = 0;
    for (let i = 0; i < input.length; i++) h = ((h << 5) - h) + input.charCodeAt(i) | 0;
    return (Math.abs(h) % 2) === 0 ? 'A' : 'B';
  }
}

function getEdgeTTL(pathname, status) {
  // Status override
  if (CONFIG.STATUS_TTL_OVERRIDES.has(status)) {
    const val = CONFIG.STATUS_TTL_OVERRIDES.get(status) || 0;
    if (val > 0) return val;
    if (!CONFIG.CACHEABLE_STATUSES.has(status)) return 0;
  }

  // Path overrides
  for (const rule of CONFIG.PATH_TTLS) {
    try {
      if (rule.test(pathname)) return rule.ttl;
    } catch { /* ignore */
    }
  }
  return CONFIG.EDGE_DEFAULT_TTL;
}

function ensureSMaxAge(existing, ttl) {
  if (!existing) return `public, s-maxage=${ttl}`;
  const parts = existing.split(',').map(s => s.trim()).filter(Boolean);
  let hasPublic = parts.some(p => /^public$/i.test(p));
  let smax = -1, idx = -1;
  parts.forEach((p, i) => {
    const m = /^s-maxage=(\d+)$/i.exec(p);
    if (m) {
      smax = parseInt(m[1], 10);
      idx = i;
    }
  });
  if (!hasPublic) parts.unshift('public');
  if (idx === -1) parts.push(`s-maxage=${ttl}`);
  else if (smax < ttl) parts[idx] = `s-maxage=${ttl}`;
  return parts.join(', ');
}

function mergeVary(existing, add = []) {
  const set = new Set((existing || '').split(',').map(s => s.trim()).filter(Boolean));
  for (const v of add) set.add(v);
  return Array.from(set).join(', ');
}
