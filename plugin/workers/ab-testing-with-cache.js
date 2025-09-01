export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

const CONFIG = {
  TIMEOUT_MS: 10000,          // fetch timeout
  COOKIE_MAX_AGE: 31536000,   // 1 year
  VALID_VARIANTS: ['A', 'B'],
  MAX_COOKIE_SIZE: 8192,
  REGISTRY_CACHE_TTL: 300,    // 5 minutes
  KV_TIMEOUT_MS: 5000,        // Timeout for KV operations
  EDGE_TTL: 300,              // Edge cache TTL for variant pages
  CACHE_ONLY_METHODS: new Set(['GET', 'HEAD']),
  STRIP_UTM_PARAMS: true,
  UTM_PARAMS: new Set([
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
    'gclid','fbclid','msclkid','mc_cid','mc_eid','_hsenc','_hsmi'
  ])
};

// Static files to bypass the AB worker
const STATIC_EXTENSIONS = new Set([
  'jpg','jpeg','png','gif','webp','svg',
  'css','js','woff','woff2','ttf','eot',
  'pdf','zip','ico','xml','txt','map','webm','mp4','mov','avi'
]);

const BYPASS_PATHS = ['/wp-admin/', '/wp-json/', '/wp-login', '/wp-content/', '/wp-includes/'];

// Cookie parsing cache
const cookieRegexCache = new Map();

// KV namespace availability memo
let kvNamespaceAvailable = null;

// In-memory registry cache
let registryCache = null;
let registryCacheTime = 0;
let kvFailureCount = 0;
const KV_FAILURE_THRESHOLD = 5;

// Cache for common paths with no tests (avoid extra KV lookups)
const NO_TEST_CACHE_PREFIX = 'https://internal/no-test-cache/';

function logInfo(env, ...args) { if (env?.DEBUG) console.log(...args); }
function logWarn(env, ...args) { if (env?.DEBUG) console.warn(...args); }
function logError(...args) { console.error(...args); }

if (!CONFIG.TIMEOUT_MS) throw new Error('Invalid worker configuration');

function checkKVNamespace(env) {
  if (kvNamespaceAvailable === null) {
    kvNamespaceAvailable = typeof env.AB_TESTS_KV !== 'undefined';
    if (!kvNamespaceAvailable) logWarn(env, 'KV namespace not bound - A/B testing disabled');
  }
  return kvNamespaceAvailable;
}

async function handleRequest(request, env, ctx) {
  const startTime = Date.now();

  const handle = async () => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Skip processing for admin, REST, previews, static, non-cacheable methods, logged-in users, etc.
    if (shouldBypassProcessing(url, request, env)) {
      return fetch(request);
    }

    // Check if path is known to have no tests
    const noTestCacheKey = new Request(NO_TEST_CACHE_PREFIX + pathname);
    const cachedNoTest = await caches.default.match(noTestCacheKey);
    if (cachedNoTest) {
      return fetch(request);
    }

    // Load registry (KV -> Cache API -> memory)
    const registry = await getTestRegistry(env, ctx);
    if (!registry || registry.length === 0) {
      return fetch(request);
    }

    // Find matching test for this path
    const matchingTest = findMatchingTest(pathname, registry);
    if (!matchingTest) {
      // Cache a lightweight "no test" marker for this path
      const noTestResponse = new Response('no-test', {
        headers: {
          'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`,
          'Content-Type': 'text/plain'
        }
      });
      ctx.waitUntil(caches.default.put(noTestCacheKey, noTestResponse));
      return fetch(request);
    }

    // Handle A/B with variant-specific cache key
    return handleABTestWithVariantCache(request, url, matchingTest, env);
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

function shouldBypassProcessing(url, request, env) {
  const path = url.pathname;

  // Methods not safe to cache at edge (let them go straight through)
  if (!CONFIG.CACHE_ONLY_METHODS.has(request.method)) return true;

  // WordPress admin, REST API, and system paths
  if (BYPASS_PATHS.some(prefix => path.startsWith(prefix))) return true;

  // Static files - check extension using pre-compiled Set
  const lastDotIndex = path.lastIndexOf('.');
  if (lastDotIndex !== -1) {
    const extension = path.substring(lastDotIndex + 1).toLowerCase();
    if (STATIC_EXTENSIONS.has(extension)) return true;
  }

  // Logged-in users (check cookies)
  const cookies = request.headers.get('Cookie') || '';
  if (cookies.includes('wordpress_logged_in_')) return true;

  // Debug flags
  if (url.searchParams.has('__cf_bypass_cache') || url.searchParams.has('nonitro')) return true;

  // Large cookie headers
  if (cookies.length > CONFIG.MAX_COOKIE_SIZE) {
    logWarn(env, 'Cookie header too large, bypassing');
    return true;
  }

  return false;
}

async function getTestRegistry(env, ctx) {
  const now = Date.now();

  // In-memory cache
  if (registryCache && (now - registryCacheTime) < (CONFIG.REGISTRY_CACHE_TTL * 1000)) {
    return registryCache;
  }

  // Circuit breaker on repeated KV failures
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
  } catch (error) {
    logWarn(env, 'Cache API read failed:', error);
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

    // Validate registry structure
    const validRegistry = registry.filter(test =>
      test &&
      typeof test.test === 'string' &&
      typeof test.cookieName === 'string' &&
      Array.isArray(test.paths) &&
      test.paths.length > 0
    );

    if (validRegistry.length !== registry.length) {
      logWarn(env, `Registry validation: ${registry.length - validRegistry.length} invalid entries filtered`);
    }

    registryCache = Object.freeze(validRegistry.map(t => Object.freeze({ ...t })));
    registryCacheTime = now;
    logInfo(env, 'Registry loaded from KV and cached:', validRegistry.length, 'tests');

    // Put into Cache API with TTL
    const cacheResponse = new Response(JSON.stringify(validRegistry), {
      headers: {
        'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}, stale-while-revalidate=${CONFIG.REGISTRY_CACHE_TTL}`,
        'Content-Type': 'application/json',
        'CDN-Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`
      }
    });
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    kvFailureCount = 0;
    return validRegistry;

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
      const normalizedPath = path.endsWith('/') ? path : path + '/';
      return pathname.startsWith(normalizedPath);
    })
  );
}

/**
 * Core: Variant-specific Cache API key (Option A) with HEAD safety & proper cloning
 */
async function handleABTestWithVariantCache(request, url, test, env) {
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

    // Optional: normalize query to avoid cache fragmentation
    if (CONFIG.STRIP_UTM_PARAMS && cacheKeyUrl.search) {
      for (const key of Array.from(cacheKeyUrl.searchParams.keys())) {
        if (CONFIG.UTM_PARAMS.has(key)) cacheKeyUrl.searchParams.delete(key);
      }
    }

    // Internal parameter only for Cache API key separation
    cacheKeyUrl.searchParams.set('__ab_variant', variant);

    // IMPORTANT: Cache API keys must be GET. We still respect the client method later.
    const getCacheKey = new Request(cacheKeyUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': request.headers.get('Accept') || '' }
    });

    // 3) Try edge cache (GET key), even for HEAD
    const cached = await cache.match(getCacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      attachABHeaders(h, test, variant, env);
      setABCookie(h, test.cookieName, variant);
      h.set('X-Variant-Cache', 'hit');
      h.set('X-Variant-Cache-Key', getCacheKey.url);

      if (request.method === 'HEAD') {
        return new Response(null, {
          status: cached.status,
          statusText: cached.statusText,
          headers: h
        });
      }
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: h
      });
    }

    // 4) Cache miss → fetch from origin with variant hints.
    const headers = new Headers(request.headers);
    headers.set('X-' + test.cookieName, variant);
    headers.set('X-AB-Variant', variant);

    // Forward AB cookie if origin uses it to render
    const existingCookie = headers.get('Cookie') || '';
    headers.set('Cookie', mergeCookie(existingCookie, `${test.cookieName}=${variant}`));

    const originReq = new Request(request, { headers });

    // Fetch and clone so we can use the body twice
    const originRes = await fetch(originReq, { signal: controller.signal });

    // 5) Prepare headers for client
    const clientHeaders = new Headers(originRes.headers);
    attachABHeaders(clientHeaders, test, variant, env);
    setABCookie(clientHeaders, test.cookieName, variant);
    clientHeaders.set('X-Variant-Cache', 'miss');
    clientHeaders.set('X-Variant-Cache-Key', getCacheKey.url);

    const isGET = request.method === 'GET';

    // Clone BEFORE consuming: one copy for cache, one for client
    const resForCache = originRes.clone();
    const resForClient = originRes; // use directly for client

    // 6) Seed edge cache **only for GET** (Cache API requires GET for put)
    if (isGET && resForCache.ok) {
      const cacheHeaders = new Headers(clientHeaders);
      cacheHeaders.delete('Set-Cookie'); // never cache Set-Cookie
      cacheHeaders.set('Cache-Control', `public, s-maxage=${CONFIG.EDGE_TTL}`);
      cacheHeaders.set('CDN-Cache-Control', `max-age=${CONFIG.EDGE_TTL}`);

      const cacheableRes = new Response(resForCache.body, {
        status: resForCache.status,
        statusText: resForCache.statusText,
        headers: cacheHeaders
      });

      await cache.put(getCacheKey, cacheableRes);
    }

    // 7) Return to client (body for GET, header-only for HEAD)
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

function attachABHeaders(h, test, variant, env) {
  h.set('X-Worker-Active', 'true');
  h.set('X-AB-Test', test.test);
  h.set('X-AB-Variant', variant);
  if (env?.DEBUG) {
    h.set('X-AB-Debug-Server-Side', 'true');
  }
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
    // exact
    forced = url.searchParams.get(altParamName);
    if (CONFIG.VALID_VARIANTS.includes(forced)) return forced;

    // case-insensitive scan
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
