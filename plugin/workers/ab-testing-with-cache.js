addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});



const CONFIG = {
  TIMEOUT_MS: 30000,
  CACHE_TTL: 14400, // 4 hours
  REGISTRY_CACHE_TTL: 300,
  COOKIE_MAX_AGE: 31536000,
  VALID_VARIANTS: ['A', 'B'],
  MAX_COOKIE_SIZE: 8192,
  STATIC_CACHE: {
    IMAGES: { edge: 604800, browser: 86400 },
    FONTS: { edge: 2592000, browser: 604800 },
    STYLES_SCRIPTS: { edge: 43200, browser: 1800 },
    DEFAULT: { edge: 86400, browser: 3600 }
  }
};

// Simple logging
function logInfo(...args) {
  console.log(...args);
}

function logWarn(...args) {
  console.warn(...args);
}

function logError(...args) {
  console.error(...args);
}

// Basic config validation
if (!CONFIG.CACHE_TTL || !CONFIG.TIMEOUT_MS) {
  throw new Error('Invalid worker configuration');
}

logInfo('Worker initialized successfully');

// Simple debug info
function createDebugInfo(request) {
  return {
    timestamp: new Date().toISOString(),
    method: request.method,
    cfRay: request.headers.get('CF-Ray')
  };
}

async function handleRequest(request, event) {
  const startTime = Date.now();
  const debugInfo = createDebugInfo(request);


  const originalRequest = request.clone();

  try {
    const url = new URL(request.url);
    // Normalize pathname case early for consistency
    const pathname = url.pathname.toLowerCase();
    debugInfo.pathname = pathname;
    debugInfo.searchParams = url.search;

    // Handle admin bypass first
    if (pathname.startsWith('/wp-admin/') || pathname.startsWith('/wp-login')) {
      return fetch(originalRequest);
    }

    // Handle static assets
    if (isStaticAsset(pathname)) {
      const staticResponse = await handleStaticAsset(request);
      staticResponse.headers.set('X-Worker-Active', 'true');
      return staticResponse;
    }


    const controller = new AbortController();
    let timeoutId;

    try {
      // Set timeout
      timeoutId = setTimeout(() => {
        logWarn(`Request timeout after ${Date.now() - startTime}ms`);
        controller.abort();
      }, CONFIG.TIMEOUT_MS);

      const response = await processRequest(request, event, controller.signal, debugInfo, url, pathname);

      // Add processing time header
      response.headers.set('X-Processing-Time', `${Date.now() - startTime}ms`);
      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        logWarn('Worker aborted, falling back to origin');
        return fetch(originalRequest);
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

  } catch (error) {
    logError('Fatal worker error:', error.message);
    try {
      return await fetch(originalRequest);
    } catch (fetchError) {
      logError('Origin fetch also failed:', fetchError);
      return new Response('Service Temporarily Unavailable', {
        status: 503,
        headers: { 'Retry-After': '60' }
      });
    }
  }
}



// Helper function to get user identifier for deterministic A/B assignment
function getUserIdentifier(request, cookieKey) {
  // Try to get user identifier from various sources
  const ip = request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Real-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();

  const userAgent = request.headers.get('User-Agent') || '';
  const url = new URL(request.url);
  
  // Get additional entropy from CF-Ray header for better distribution in real traffic
  const cfRay = request.headers.get('CF-Ray') || '';
  
  // Use both IP and User-Agent for better distribution
  // This ensures different browsers/devices get different variants even from same IP
  const primaryId = ip || 'unknown';
  const userAgentHash = userAgent.substring(0, 100); // Use more of the user agent
  
  // Create a composite identifier that's consistent but not personally identifiable
  // Use hostname to ensure different sites get different distributions
  return `${primaryId}-${cookieKey}-${url.hostname}-${userAgentHash}-${cfRay}`;
}

// Deterministic variant assignment based on user identifier
function getDeterministicVariant(userIdentifier) {
  // Use a simple but effective hash that's more balanced
  let hash = 0;
  for (let i = 0; i < userIdentifier.length; i++) {
    const char = userIdentifier.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use a different approach for better distribution
  // Take the last digit of the absolute hash value
  const lastDigit = Math.abs(hash) % 10;
  
  // Return A or B based on even/odd (50/50 split)
  return (lastDigit % 2) === 0 ? 'A' : 'B';
}

// Set A/B test cookies with input validation and error handling
function setAbTestCookies(response, variantMap) {
  // Input validation
  if (!response || typeof response.headers?.append !== 'function') {
    logWarn('Invalid response object passed to setAbTestCookies');
    return;
  }

  if (!variantMap || typeof variantMap !== 'object') {
    logWarn('Invalid variantMap passed to setAbTestCookies');
    return;
  }

  try {
    Object.entries(variantMap).forEach(([cookieName, variant]) => {
      // Validate cookie name and variant
      if (!cookieName || typeof cookieName !== 'string') {
        logWarn('Invalid cookie name:', cookieName);
        return;
      }

      if (!variant || !CONFIG.VALID_VARIANTS.includes(variant)) {
        logWarn('Invalid variant for cookie', cookieName, ':', variant);
        return;
      }

      // Sanitize cookie name to prevent header injection
      const safeCookieName = cookieName.replace(/[^a-zA-Z0-9_-]/g, '_');

      response.headers.append('Set-Cookie',
          `${safeCookieName}=${variant}; Path=/; Max-Age=${CONFIG.COOKIE_MAX_AGE}; Secure; SameSite=Lax; HttpOnly`
      );
    });
  } catch (error) {
    logError('Error setting A/B test cookies:', error.message);
  }
}

// Get A/B test variants for the current request
async function getAbVariants(request, cache, event, cookieHeader, pathname) {
  const testsRegistry = await fetchRegistryWithTimeout(cache, event);
  const cookies = parseCookies(cookieHeader);
  const activeTests = filterActiveTests(testsRegistry, pathname);
  const variantMap = {};

  activeTests.forEach(item => {
    const cookieKey = item.cookieName;
    if (!cookieKey) return;

    let variant = cookies[cookieKey];

    if (!CONFIG.VALID_VARIANTS.includes(variant)) {
      // Use deterministic assignment based on user identifier for consistency
      // while ensuring first-load works immediately
      const userIdentifier = getUserIdentifier(request, cookieKey);
      variant = getDeterministicVariant(userIdentifier);
    }

    if (CONFIG.VALID_VARIANTS.includes(variant)) {
      variantMap[cookieKey] = variant;
    }
  });

  return variantMap;
}

// Handle bypass requests (logged-in users, debug flags)
async function handleBypassRequest(request, signal, variantMap, isLoggedIn, bypassFlag) {
  const headers = new Headers(request.headers);
  Object.entries(variantMap).forEach(([cookieName, variant]) => {
    const headerName = 'X-' + cookieName.replace(/_/g, '-');
    headers.set(headerName, variant);
  });

  const originRequest = new Request(request, { headers });
  const originResponse = await fetch(originRequest, { signal });
  const response = new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers: new Headers(originResponse.headers)
  });

  response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0');
  response.headers.set('X-Cache-Status', isLoggedIn ? 'BYPASS-LOGGED-IN' : 'BYPASS-DEBUG');
  response.headers.set('X-Worker-Active', 'true');
  response.headers.set('Vary', 'Cookie');
  // Always set A/B cookies even on bypass
  setAbTestCookies(response, variantMap);
  return response;
}

// Handle cacheable requests
async function handleCacheableRequest(request, event, signal, cache, cacheKey, variantMap) {
  // Cache lookup
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    const response = new Response(request.method === 'HEAD' ? null : cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers: new Headers(cachedResponse.headers)
    });
    response.headers.set('X-Cache-Status', 'HIT');
    response.headers.set('X-Worker-Active', 'true');
    response.headers.set('Vary', 'Cookie');
    // Always set A/B cookies on cache hit to ensure consistency
    setAbTestCookies(response, variantMap);
    return response;
  }

  // Fetch from origin since it's not in cache
  const originResponse = await fetchFromOrigin(request, signal, variantMap);

  // Create a new response so we can modify headers
  const response = new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers: new Headers(originResponse.headers)
  });

  // Set all headers for the response to the browser
  response.headers.set('X-Cache-Status', 'MISS');
  response.headers.set('X-Worker-Active', 'true');
  response.headers.set('Vary', 'Cookie');
  if (cacheKey) {
    response.headers.set('X-Cache-Key', cacheKey.url);
  }
  setAbTestCookies(response, variantMap);

  // Cache successful responses
  if (response.ok) {
    response.headers.set('X-Will-Cache', 'true');

    // We need to cache the response, but we also need to return it.
    // We clone the response to create a second, identical response object.
    const responseToCache = response.clone();

    // Set the final cache headers on the version we are about to cache.
    responseToCache.headers.set('Cache-Control', `public, max-age=0, s-maxage=${CONFIG.CACHE_TTL}`);
    responseToCache.headers.set('Vary', 'Cookie');
    responseToCache.headers.set('X-Will-Cache', 'true');

    event.waitUntil(
        cache.put(cacheKey, responseToCache).catch(e =>
            logError('Cache put failed:', e.message)
        )
    );
  } else {
    response.headers.set('X-Will-Cache', 'false');
  }

  return response;
}

// Fetch from origin with A/B headers
async function fetchFromOrigin(request, signal, variantMap) {
  const headers = new Headers(request.headers);
  Object.entries(variantMap).forEach(([cookieName, variant]) => {
    const headerName = 'X-' + cookieName.replace(/_/g, '-');
    headers.set(headerName, variant);
  });

  // Add A/B test cookies to the Cookie header for the origin
  const newCookieHeader = Object.entries(variantMap)
      .map(([cookieName, variant]) => `${encodeURIComponent(cookieName)}=${encodeURIComponent(variant)}`)
      .join('; ');
  if (newCookieHeader) {
    const existingCookieHeader = headers.get('Cookie') || '';
    headers.set('Cookie', existingCookieHeader ? `${existingCookieHeader}; ${newCookieHeader}` : newCookieHeader);
  }

  const originMethod = request.method === 'HEAD' ? 'GET' : request.method;
  const originRequest = new Request(request, { headers, method: originMethod });
  return fetch(originRequest, { signal });
}

async function processRequest(request, event, signal, debugInfo, url, pathname) {
  let cookieHeader = request.headers.get('Cookie') || '';

  // Limit cookie header size
  if (cookieHeader.length > CONFIG.MAX_COOKIE_SIZE) {
    return new Response('Cookie header size exceeds the maximum allowed limit.', { status: 400 });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return handleNonGetHead(request, signal);
  }

  const cache = caches.default;

  // Get A/B test variants
  const variantMap = await getAbVariants(request, cache, event, cookieHeader, pathname);

  // Check for bypass conditions
  const bypassFlag = url.searchParams.has('__cf_bypass_cache') || url.searchParams.has('nonitro');
  const isLoggedIn = /wordpress_logged_in_/i.test(cookieHeader);

  if (isLoggedIn || bypassFlag) {
    return handleBypassRequest(request, signal, variantMap, isLoggedIn, bypassFlag);
  }

  // Build cache key and handle cacheable request
  const cacheKey = buildCacheKey(url, variantMap);
  return handleCacheableRequest(request, event, signal, cache, cacheKey, variantMap);
}

function buildCacheKey(url, variantMap) {
  const cacheUrl = new URL(url);

  // Remove bypass flags
  cacheUrl.searchParams.delete('__cf_bypass_cache');
  cacheUrl.searchParams.delete('nonitro');

  // Add A/B variants as a parameter if present
  if (variantMap && Object.keys(variantMap).length > 0) {
    const variants = Object.entries(variantMap)
        .filter(([k, v]) => k && v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join(';');

    if (variants) {
      cacheUrl.searchParams.set('__ab', variants);
    }
  }

  return new Request(cacheUrl.toString(), { method: 'GET' });
}

// Simple cookie parsing
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  const cookiePairs = cookieHeader.split(';');
  for (let i = 0; i < cookiePairs.length; i++) {
    const cookie = cookiePairs[i];
    if (!cookie) continue;

    const equalIndex = cookie.indexOf('=');
    if (equalIndex === -1) continue;

    try {
      const key = decodeURIComponent(cookie.substring(0, equalIndex).trim());
      const value = decodeURIComponent(cookie.substring(equalIndex + 1));
      if (key) {
        cookies[key] = value;
      }
    } catch (e) {
      // Skip malformed cookies
    }
  }
  return cookies;
}

// Handle non-GET/HEAD requests
async function handleNonGetHead(request, signal) {
  const response = await fetch(request, { signal });
  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
  modifiedResponse.headers.set('X-Worker-Active', 'true');
  return modifiedResponse;
}

// Fetch registry with timeout
async function fetchRegistryWithTimeout(cache, event) {
  try {
    return await getRegistry(cache, event) || [];
  } catch (e) {
    logWarn('Registry fetch failed:', e.message);
    return [];
  }
}

// Filter active A/B tests
function filterActiveTests(testsRegistry, pathname) {
  return testsRegistry.filter(item => {
    return item &&
        item.paths &&
        Array.isArray(item.paths) &&
        item.cookieName &&
        item.paths.some(prefix => {
          if (!prefix) return false;
          if (prefix === '/') return true;
          // Check for exact match on the prefix
          if (pathname === prefix) return true;
          // Check for paths underneath the prefix. Ensure prefix ends with /
          const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
          return pathname.startsWith(normalizedPrefix);
        });
  });
}


// Optimized static asset detection with Set-based lookup
const STATIC_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'css', 'js', 'ico', 'svg',
  'woff', 'woff2', 'ttf', 'eot', 'pdf', 'zip', 'mp4', 'mp3'
]);
const STATIC_PATHS = ['/wp-content/uploads/', '/wp-includes/'];

function isStaticAsset(pathname) {
  // Check paths first (faster than regex)
  if (STATIC_PATHS.some(path => pathname.startsWith(path))) return true;

  // Check extension using Set lookup (O(1) vs O(n) regex)
  const lastDotIndex = pathname.lastIndexOf('.');
  if (lastDotIndex === -1) return false;

  const ext = pathname.substring(lastDotIndex + 1).toLowerCase();
  return STATIC_EXTENSIONS.has(ext);
}

async function handleStaticAsset(request) {
  const url = new URL(request.url);
  // Use pre-normalized pathname to avoid re-lowercasing
  const pathname = url.pathname.toLowerCase();

  // Determine cache settings based on file type
  let cacheConfig = CONFIG.STATIC_CACHE.DEFAULT;

  if (/\.(jpg|jpeg|png|gif|webp|ico|svg)$/i.test(pathname)) {
    cacheConfig = CONFIG.STATIC_CACHE.IMAGES;
  } else if (/\.(woff|woff2|ttf|eot)$/i.test(pathname)) {
    cacheConfig = CONFIG.STATIC_CACHE.FONTS;
  } else if (/\.(css|js)$/i.test(pathname)) {
    cacheConfig = CONFIG.STATIC_CACHE.STYLES_SCRIPTS;
  }

  // Fetch with aggressive edge caching
  const response = await fetch(request, {
    cf: {
      cacheEverything: true,
      cacheTtl: cacheConfig.edge,
      browserTtl: cacheConfig.browser
    }
  });

  // Clone response to modify headers
  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });

  // Set explicit cache headers and debug info
  modifiedResponse.headers.set('Cache-Control',
      `public, max-age=${cacheConfig.browser}, s-maxage=${cacheConfig.edge}`
  );
  modifiedResponse.headers.set('X-Static-Asset', 'true');
  modifiedResponse.headers.set('X-Cache-Type', getAssetType(pathname));

  return modifiedResponse;
}

function getAssetType(pathname) {
  if (/\.(jpg|jpeg|png|gif|webp|ico|svg)$/i.test(pathname)) return 'image';
  if (/\.(woff|woff2|ttf|eot)$/i.test(pathname)) return 'font';
  if (/\.(css|js)$/i.test(pathname)) return 'style-script';
  return 'other';
}

async function getRegistry(cache, event) {
  const cacheKey = new Request('https://internal/kv-registry-cache');

  // Try cache first
  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return await cached.json();
    }
  } catch (e) {
    logWarn('Registry cache read failed:', e.message);
  }

  // Fetch from KV
  try {
    if (typeof AB_TESTS_KV === 'undefined') {
      return [];
    }

    const registry = await AB_TESTS_KV.get("registry", { type: "json" }) || [];

    // Cache the result
    event.waitUntil(
        cache.put(cacheKey, new Response(JSON.stringify(registry), {
          headers: { 'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}` }
        })).catch(e => logWarn('Registry cache failed:', e.message))
    );

    return registry;
  } catch (e) {
    logWarn('KV fetch failed:', e.message);
    return [];
  }
}