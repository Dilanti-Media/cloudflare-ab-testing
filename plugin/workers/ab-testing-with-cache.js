export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

/**
 * =========================================================
 * Config
 * =========================================================
 */
const CONFIG = {
  TIMEOUT_MS: 10000,
  COOKIE_MAX_AGE: 31536000, // 1 year
  VALID_VARIANTS: ['A', 'B'],
  MAX_COOKIE_SIZE: 8192,

  // Registry caching & KV behavior
  REGISTRY_CACHE_TTL: 300, // seconds
  KV_TIMEOUT_MS: 5000,

  // Edge cache defaults for HTML responses (can be overridden per-path/status)
  EDGE_DEFAULT_TTL: 300, // seconds

  // Non-GET methods bypass caching
  CACHE_ONLY_METHODS: new Set(['GET', 'HEAD']),

  // Query normalization
  STRIP_UTM_PARAMS: true,
  UTM_PARAMS: new Set([
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
    'gclid','fbclid','msclkid','mc_cid','mc_eid','_hsenc','_hsmi'
  ]),

  // Warm a GET in the background when HEAD misses (keeps CLI checks smooth)
  WARM_ON_HEAD_MISS: true,

  // Optional: per-path TTL rules (first matching rule wins)
  // Each entry: { test: (pathname) => boolean, ttl: seconds }
  PATH_TTLS: [
    // Example: homepage longer TTL
    { test: (p) => p === '/' || p === '/index.html', ttl: 600 },
    // Example: any /blog/ shorter TTL
    { test: (p) => p.startsWith('/blog/'), ttl: 180 },
  ],

  // Optional: status-based TTL overrides (applied after PATH_TTLS)
  // Common practice: cache 200/301/302 normally, keep errors short
  STATUS_TTL_OVERRIDES: new Map([
    [200, 0],   // 0 means "use path/default TTL"
    [301, 0],
    [302, 60],  // e.g., short TTL for redirects if desired
    [404, 60],
    [500, 0],   // 0 here can mean "don’t cache non-OK", we enforce below
    [502, 0],
    [503, 0],
  ]),

  // What statuses are allowed to be cached at all
  CACHEABLE_STATUSES: new Set([200, 301, 302, 404]),
};

// Static assets to bypass AB logic entirely (served by your existing cache setup)
const STATIC_EXTENSIONS = new Set([
  'jpg','jpeg','png','gif','webp','svg',
  'css','js','woff','woff2','ttf','eot',
  'pdf','zip','ico','xml','txt','map','webm','mp4','mov','avi'
]);

const BYPASS_PATHS = ['/wp-admin/', '/wp-json/', '/wp-login', '/wp-content/', '/wp-includes/'];

// Cookie regex cache
const cookieRegexCache = new Map();

// KV namespace availability memo
let kvNamespaceAvailable = null;

// In-memory registry cache
let registryCache = null;
let registryCacheTime = 0;
let kvFailureCount = 0;
const KV_FAILURE_THRESHOLD = 5;

// Cache for “no tests on this path” markers (reduces KV reads)
const NO_TEST_CACHE_PREFIX = 'https://internal/no-test-cache/';

// Logging
function logInfo(env, ...args) { if (env?.DEBUG) console.log(...args); }
function logWarn(env, ...args) { if (env?.DEBUG) console.warn(...args); }
function logError(...args) { console.error(...args); }

// Guard
if (!CONFIG.TIMEOUT_MS) throw new Error('Invalid worker configuration');

/**
 * =========================================================
 * Request Entry
 * =========================================================
 */
async function handleRequest(request, env, ctx) {
  const startTime = Date.now();

  const handle = async () => {
    const url = new URL(request.url);
    const { pathname } = url;

    // Skip processing for admin, REST, previews, static, non-cacheable methods, logged-in users, etc.
    if (shouldBypassProcessing(url, request, env)) {
      return fetch(request);
    }

    // Quick “no test here” check
    const noTestCacheKey = new Request(NO_TEST_CACHE_PREFIX + pathname);
    const cachedNoTest = await caches.default.match(noTestCacheKey);
    if (cachedNoTest) {
      return fetch(request);
    }

    // Load AB test registry (KV -> Cache API -> memory)
    const registry = await getTestRegistry(env, ctx);
    if (!registry || registry.length === 0) {
      return fetch(request);
    }

    // Find a test that matches this path
    const matchingTest = findMatchingTest(pathname, registry);
    if (!matchingTest) {
      // Mark path as “no test” for a short while
      const noTestResponse = new Response('no-test', {
        headers: {
          'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`,
          'Content-Type': 'text/plain'
        }
      });
      ctx.waitUntil(caches.default.put(noTestCacheKey, noTestResponse));
      return fetch(request);
    }

    // Run AB logic with variant-split caching
    return handleABTestWithVariantCache(request, url, matchingTest, env, ctx);
  };

  try {
    const response = await handle();
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Worker-Duration', `${Date.now() - startTime}ms`);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    logError('Worker error:', error);
    const errorResponse = new Response('Worker Error: Request Processing Failed', { status: 500 });
    const newHeaders = new Headers(errorResponse.headers);
    newHeaders.set('X-Worker-Duration', `${Date.now() - startTime}ms`);
    if (error.name) newHeaders.set('X-Error-Name', error.name);
    if (error.message) newHeaders.set('X-Error-Message', error.message);
    return new Response(errorResponse.body, {
      status: errorResponse.status,
      statusText: errorResponse.statusText,
      headers: newHeaders,
    });
  }
}

/**
 * =========================================================
 * Bypass logic
 * =========================================================
 */
function shouldBypassProcessing(url, request, env) {
  const path = url.pathname;

  // Methods not safe to cache at edge
  if (!CONFIG.CACHE_ONLY_METHODS.has(request.method)) return true;

  // WordPress admin, REST, and system paths
  if (BYPASS_PATHS.some(prefix => path.startsWith(prefix))) return true;

  // Static files
  const lastDot = path.lastIndexOf('.');
  if (lastDot !== -1) {
    const ext = path.substring(lastDot + 1).toLowerCase();
    if (STATIC_EXTENSIONS.has(ext)) return true;
  }

  // Logged-in users
  const cookies = request.headers.get('Cookie') || '';
  if (cookies.includes('wordpress_logged_in_')) return true;

  // Debug flags
  if (url.searchParams.has('__cf_bypass_cache') || url.searchParams.has('nonitro')) return true;

  // Oversized cookie header (avoid edge cache pollution)
  if (cookies.length > CONFIG.MAX_COOKIE_SIZE) {
    logWarn(env, 'Cookie header too large, bypassing');
    return true;
  }

  return false;
}

/**
 * =========================================================
 * KV-backed registry
 * =========================================================
 */
function checkKVNamespace(env) {
  if (kvNamespaceAvailable === null) {
    kvNamespaceAvailable = typeof env.AB_TESTS_KV !== 'undefined';
    if (!kvNamespaceAvailable) logWarn(env, 'KV namespace not bound - A/B testing disabled');
  }
  return kvNamespaceAvailable;
}

async function getTestRegistry(env, ctx) {
  const now = Date.now();

  // In-memory cache
  if (registryCache && (now - registryCacheTime) < (CONFIG.REGISTRY_CACHE_TTL * 1000)) {
    return registryCache;
  }

  // Circuit breaker
  if (kvFailureCount > KV_FAILURE_THRESHOLD) {
    logWarn(env, `KV failure threshold exceeded (${kvFailureCount}), skipping KV temporarily`);
    if (registryCache) return registryCache;
    return [];
  }

  // Cache API (shared across isolates)
  const cacheKey = new Request('https://internal/ab-registry-cache-v1');
  const cache = caches.default;

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const cachedRegistry = await cachedResponse.json();
      if (Array.isArray(cachedRegistry)) {
        registryCache = cachedRegistry;
        registryCacheTime = now;
        logInfo(env, 'Registry loaded from Cache API:', cachedRegistry.length, 'tests');
        return cachedRegistry;
      }
    }
  } catch (err) {
    logWarn(env, 'Cache API read failed:', err);
  }

  try {
    if (!checkKVNamespace(env)) return [];

    const kvPromise = env.AB_TESTS_KV.get('registry', { type: 'json' });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('KV timeout')), CONFIG.KV_TIMEOUT_MS)
    );

    const registry = await Promise.race([kvPromise, timeoutPromise]);
    if (!registry || !Array.isArray(registry)) {
      logInfo(env, 'No valid registry found');
      registryCache = [];
      registryCacheTime = now;
      return [];
    }

    // Validate entries
    const valid = registry.filter(t =>
      t &&
      typeof t.test === 'string' &&
      typeof t.cookieName === 'string' &&
      Array.isArray(t.paths) &&
      t.paths.length > 0
    );

    if (valid.length !== registry.length) {
      logWarn(env, `Registry validation: ${registry.length - valid.length} invalid entries filtered`);
    }

    registryCache = Object.freeze(valid.map(t => Object.freeze({ ...t })));
    registryCacheTime = now;

    // Store to Cache API with TTL
    const cacheResponse = new Response(JSON.stringify(valid), {
      headers: {
        'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}, stale-while-revalidate=${CONFIG.REGISTRY_CACHE_TTL}`,
        'Content-Type': 'application/json',
        'CDN-Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`
      }
    });
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    kvFailureCount = 0;
    return valid;

  } catch (error) {
    logError('Registry fetch failed:', error);
    kvFailureCount++;
    if (registryCache) {
      const staleness = Math.round((now - registryCacheTime) / 1000);
      logWarn(env, `Using stale cached registry (${staleness}s old) due to fetch error`);
      return registryCache;
    }
    return [];
  }
}

function findMatchingTest(pathname, registry) {
  return registry.find(test =>
    test.paths &&
    Array.isArray(test.paths) &&
    test.paths.some(path => {
      if (pathname === path) return true;
      const norm = path.endsWith('/') ? path : path + '/';
      return pathname.startsWith(norm);
    })
  );
}

/**
 * =========================================================
 * Core AB + variant-split cache
 * =========================================================
 */
async function handleABTestWithVariantCache(request, url, test, env, ctx) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    // 1) Sticky variant or deterministic fallback
    let variant = getVariantFromRequest(request, test.cookieName, test.test);
    if (!variant) {
      variant = await generateVariant(request);
    }

    // 2) Build a variant-specific synthetic cache key (ALWAYS GET for Cache API)
    const cache = caches.default;
    const cacheKeyUrl = new URL(url.toString());

    // Query normalization
    if (CONFIG.STRIP_UTM_PARAMS && cacheKeyUrl.search) {
      for (const key of Array.from(cacheKeyUrl.searchParams.keys())) {
        if (CONFIG.UTM_PARAMS.has(key)) cacheKeyUrl.searchParams.delete(key);
      }
    }

    // Remove forcing params (cookieName + test name, case-insensitive) so forced/natural share one entry
    cacheKeyUrl.searchParams.delete(test.cookieName);
    if (test.test) {
      for (const key of Array.from(cacheKeyUrl.searchParams.keys())) {
        if (key.toLowerCase() === String(test.test).toLowerCase()) {
          cacheKeyUrl.searchParams.delete(key);
        }
      }
    }

    // Internal param only for the Cache API key (does not reach origin)
    cacheKeyUrl.searchParams.set('__ab_variant', variant);

    const getCacheKey = new Request(cacheKeyUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': request.headers.get('Accept') || '' }
    });

    // 3) Try edge cache first (even for HEAD requests)
    const cached = await cache.match(getCacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      attachABHeaders(h, test, variant, env);
      setABCookie(h, test.cookieName, variant);
      h.set('X-Variant-Cache', 'hit');
      h.set('X-Variant-Cache-Key', getCacheKey.url);

      if (request.method === 'HEAD') {
        return new Response(null, { status: cached.status, statusText: cached.statusText, headers: h });
      }
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: h });
    }

    // 4) Cache miss → fetch from origin with variant hints
    const headers = new Headers(request.headers);
    headers.set('X-' + test.cookieName, variant);
    headers.set('X-AB-Variant', variant);

    // If origin renders by cookie, forward the AB cookie too
    const existingCookie = headers.get('Cookie') || '';
    headers.set('Cookie', mergeCookie(existingCookie, `${test.cookieName}=${variant}`));

    const originReq = new Request(request, { headers });
    const originRes = await fetch(originReq, { signal: controller.signal });

    // 5) Compute per-response TTL
    const ttl = getEdgeTTL(url.pathname, originRes.status);

    // 6) Prepare headers for client
    const clientHeaders = new Headers(originRes.headers);
    attachABHeaders(clientHeaders, test, variant, env);
    setABCookie(clientHeaders, test.cookieName, variant);
    clientHeaders.set('X-Variant-Cache', 'miss');
    clientHeaders.set('X-Variant-Cache-Key', getCacheKey.url);

    const isGET = request.method === 'GET';

    // 7) Clone BEFORE consuming: one copy for cache, one for client
    const resForCache = originRes.clone();
    const resForClient = originRes;

    // 8) Seed edge cache (GET only) if status is cacheable and TTL > 0
    if (isGET && CONFIG.CACHEABLE_STATUSES.has(resForCache.status) && ttl > 0) {
      const cacheHeaders = new Headers(clientHeaders);
      cacheHeaders.delete('Set-Cookie'); // never cache Set-Cookie
      // Respect existing s-maxage if present, otherwise set ours
      // We prefer explicit edge directives:
      cacheHeaders.set('Cache-Control', ensureSMaxAge(cacheHeaders.get('Cache-Control'), ttl));
      cacheHeaders.set('CDN-Cache-Control', `max-age=${ttl}`);

      const cacheableRes = new Response(resForCache.body, {
        status: resForCache.status,
        statusText: resForCache.statusText,
        headers: cacheHeaders
      });

      await cache.put(getCacheKey, cacheableRes);
    } else if (request.method === 'HEAD' && CONFIG.WARM_ON_HEAD_MISS && ttl > 0) {
      // Optional: warm the GET in background on HEAD miss
      ctx.waitUntil((async () => {
        try {
          const warmHeaders = new Headers(headers);
          const warmReq = new Request(new URL(url.toString()).toString(), { method: 'GET', headers: warmHeaders });
          const warmRes = await fetch(warmReq, { signal: controller.signal });
          if (CONFIG.CACHEABLE_STATUSES.has(warmRes.status)) {
            const h2 = new Headers(warmRes.headers);
            // Strip Set-Cookie, set edge directives
            h2.delete('Set-Cookie');
            h2.set('Cache-Control', ensureSMaxAge(h2.get('Cache-Control'), ttl));
            h2.set('CDN-Cache-Control', `max-age=${ttl}`);
            await caches.default.put(getCacheKey, new Response(warmRes.body, { status: warmRes.status, statusText: warmRes.statusText, headers: h2 }));
          }
        } catch (e) {
          logWarn(env, 'HEAD warm failed:', e);
        }
      })());
    }

    // 9) Return to client (body for GET, header-only for HEAD)
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

/**
 * =========================================================
 * Helpers
 * =========================================================
 */
function attachABHeaders(h, test, variant, env) {
  h.set('X-Worker-Active', 'true');
  h.set('X-AB-Test', test.test);
  h.set('X-AB-Variant', variant);
  if (env?.DEBUG) h.set('X-AB-Debug-Server-Side', 'true');
}

function setABCookie(h, cookieName, variant) {
  h.append('Set-Cookie',
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

/**
 * Forcing: via URL param matching cookieName OR test name (case-insensitive),
 * then cookie, else null (so generator runs).
 */
function getVariantFromRequest(request, cookieName, altParamName) {
  const url = new URL(request.url);

  // 1) URL forcing via cookieName (primary)
  let forced = url.searchParams.get(cookieName);
  if (CONFIG.VALID_VARIANTS.includes(forced)) return forced;

  // 2) URL forcing via alternative param (e.g., test name), case-insensitive
  if (altParamName) {
    forced = url.searchParams.get(altParamName);
    if (CONFIG.VALID_VARIANTS.includes(forced)) return forced;
    for (const [k, v] of url.searchParams.entries()) {
      if (k.toLowerCase() === String(altParamName).toLowerCase() && CONFIG.VALID_VARIANTS.includes(v)) {
        return v;
      }
    }
  }

  // 3) Cookie
  const cookies = request.headers.get('Cookie') || '';
  if (cookies) {
    if (cookieRegexCache.size > 50) cookieRegexCache.clear();
    if (!cookieRegexCache.has(cookieName)) {
      cookieRegexCache.set(cookieName, new RegExp(`(?:^|; )${cookieName}=([AB])(?:;|$)`));
    }
    const cookieRegex = cookieRegexCache.get(cookieName);
    const match = cookies.match(cookieRegex);
    if (match && CONFIG.VALID_VARIANTS.includes(match[1])) {
      return match[1];
    }
  }

  return null;
}

/**
 * Deterministic 50/50 without CF-Ray (stable across requests until cookie set)
 */
async function generateVariant(request) {
  const ip = request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '127.0.0.1';
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 80);
  const input = `${ip}|${userAgent}`;

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const byte0 = new Uint8Array(hashBuffer)[0];
    return (byte0 % 2) === 0 ? 'A' : 'B';
  } catch (_e) {
    let h = 0;
    for (let i = 0; i < input.length; i++) h = ((h << 5) - h) + input.charCodeAt(i) | 0;
    return (Math.abs(h) % 2) === 0 ? 'A' : 'B';
  }
}

/**
 * Edge TTL selection with path & status overrides.
 * Returns seconds (0 => don’t cache via Cache API).
 */
function getEdgeTTL(pathname, status) {
  // Status override (if value > 0, use directly; if 0, fall through)
  if (CONFIG.STATUS_TTL_OVERRIDES.has(status)) {
    const val = CONFIG.STATUS_TTL_OVERRIDES.get(status) || 0;
    if (val > 0) return val;
    // If val === 0, keep evaluating path/default, but allow cacheable statuses to be vetoed elsewhere
    if (!CONFIG.CACHEABLE_STATUSES.has(status)) return 0;
  }

  // Path override
  for (const rule of CONFIG.PATH_TTLS) {
    try {
      if (rule.test(pathname)) return rule.ttl;
    } catch { /* ignore */ }
  }

  // Default
  return CONFIG.EDGE_DEFAULT_TTL;
}

/**
 * Ensure Cache-Control contains an s-maxage; if present, keep the larger one.
 */
function ensureSMaxAge(existing, ttl) {
  if (!existing) return `public, s-maxage=${ttl}`;
  const parts = existing.split(',').map(s => s.trim());
  let found = false;
  let current = ttl;
  for (let i = 0; i < parts.length; i++) {
    const m = /^s-maxage=(\d+)$/i.exec(parts[i]);
    if (m) {
      found = true;
      const present = parseInt(m[1], 10);
      // Prefer the *larger* s-maxage to avoid accidentally shortening edge TTL
      if (present < ttl) parts[i] = `s-maxage=${ttl}`;
      current = Math.max(present, ttl);
    }
  }
  if (!found) parts.push(`s-maxage=${ttl}`);
  // Always ensure "public" for shared caches
  if (!parts.some(p => /^public$/i.test(p))) parts.unshift('public');
  return parts.join(', ');
}
