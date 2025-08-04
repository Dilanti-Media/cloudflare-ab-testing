export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

const CONFIG = {
  TIMEOUT_MS: 10000, // Reduced from 30s to 10s to avoid Cloudflare limits
  COOKIE_MAX_AGE: 31536000, // 1 year
  VALID_VARIANTS: ['A', 'B'],
  MAX_COOKIE_SIZE: 8192,
  REGISTRY_CACHE_TTL: 300, // 5 minutes
  KV_TIMEOUT_MS: 5000 // Timeout for KV operations
};

// Pre-compile regex and sets for performance
const STATIC_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 
  'css', 'js', 'woff', 'woff2', 'ttf', 'eot',
  'pdf', 'zip', 'ico', 'xml', 'txt'
]);

const BYPASS_PATHS = ['/wp-admin/', '/wp-json/', '/wp-login', '/wp-content/', '/wp-includes/'];

// Pre-compile cookie regexes to avoid per-request compilation
const cookieRegexCache = new Map(); // cookieName -> RegExp

// Check KV namespace binding once at module load
let kvNamespaceAvailable = null;

// In-memory cache for KV registry
let registryCache = null;
let registryCacheTime = 0;
let kvFailureCount = 0;
const KV_FAILURE_THRESHOLD = 5;

// Cache for common paths that have no tests (to avoid KV lookups)
// Using Cache API instead of global Map for memory safety
const NO_TEST_CACHE_PREFIX = 'https://internal/no-test-cache/';

// Simple logging with debug flag
function logInfo(env, ...args) {
  if (env?.DEBUG) {
    console.log(...args);
  }
}

function logWarn(env, ...args) {
  if (env?.DEBUG) {
    console.warn(...args);
  }
}

function logError(...args) {
  // Always log errors, even in production
  console.error(...args);
}

/**
 * HTML escape function to prevent XSS vulnerabilities
 * Escapes characters that could be used to inject malicious HTML
 */
function escapeHtml(unsafe) {
  if (!unsafe || typeof unsafe !== 'string') {
    return '';
  }
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Basic config validation
if (!CONFIG.TIMEOUT_MS) {
  throw new Error('Invalid worker configuration');
}

// Check KV namespace availability once
function checkKVNamespace(env) {
  if (kvNamespaceAvailable === null) {
    kvNamespaceAvailable = typeof env.AB_TESTS_KV !== 'undefined';
    if (!kvNamespaceAvailable) {
      logWarn(env, 'KV namespace not bound - A/B testing disabled');
    }
  }
  return kvNamespaceAvailable;
}

// Worker initialization logged per request

async function handleRequest(request, env, ctx) {
  const startTime = Date.now();

  const handle = async () => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Skip processing for WordPress admin, REST API, system paths, or static files
    if (shouldBypassProcessing(url, request)) {
      return fetch(request);
    }

    // Check if this path is known to have no tests (avoid KV call)
    const noTestCacheKey = new Request(NO_TEST_CACHE_PREFIX + pathname);
    const cachedNoTest = await caches.default.match(noTestCacheKey);
    if (cachedNoTest) {
      return fetch(request);
    }

    // Get A/B test registry (cached)
    const registry = await getTestRegistry(env, ctx);
    if (!registry || registry.length === 0) {
      return fetch(request);
    }

    // Find matching test for current path
    const matchingTest = findMatchingTest(pathname, registry);
    if (!matchingTest) {
      // Cache this path as having no tests using Cache API with TTL
      const noTestResponse = new Response('no-test', {
        headers: {
          'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`,
          'Content-Type': 'text/plain'
        }
      });

      // Cache without awaiting to avoid slowing down the request
      ctx.waitUntil(caches.default.put(noTestCacheKey, noTestResponse));

      return fetch(request);
    }

    // Handle A/B test logic with timeout
    return handleABTestWithTimeout(request, url, matchingTest, env);
  };

  try {
    const response = await handle();
    // Clone headers to make them mutable
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

function shouldBypassProcessing(url, request) {
  const path = url.pathname;
  
  // WordPress admin, REST API, and system paths
  if (BYPASS_PATHS.some(prefix => path.startsWith(prefix))) {
    return true;
  }
  
  // Static files - check extension using pre-compiled Set
  const lastDotIndex = path.lastIndexOf('.');
  if (lastDotIndex !== -1) {
    const extension = path.substring(lastDotIndex + 1).toLowerCase();
    if (STATIC_EXTENSIONS.has(extension)) {
      return true;
    }
  }
  
  // Logged-in users (check cookies)
  const cookies = request.headers.get('Cookie') || '';
  if (cookies.includes('wordpress_logged_in_')) {
    return true;
  }
  
  // Debug flags
  if (url.searchParams.has('__cf_bypass_cache') || 
      url.searchParams.has('nonitro')) {
    return true;
  }
  
  // Large cookie headers
  if (cookies.length > CONFIG.MAX_COOKIE_SIZE) {
    logWarn(env, 'Cookie header too large, bypassing');
    return true;
  }
  
  return false;
}

async function getTestRegistry(env, ctx) {
  const now = Date.now();
  
  // Check in-memory cache first (fastest)
  if (registryCache && (now - registryCacheTime) < (CONFIG.REGISTRY_CACHE_TTL * 1000)) {
    return registryCache;
  }

  // Error boundary enhancement: circuit breaker for KV failures
  if (kvFailureCount > KV_FAILURE_THRESHOLD) {
    logWarn(env, `KV failure threshold exceeded (${kvFailureCount} failures), skipping A/B testing temporarily.`);
    // Still check for stale cache, but don't hit KV
    if (registryCache) {
      return registryCache;
    }
    return [];
  }
  
  // Check Cache API for global consistency across instances
  const cacheKey = new Request(`https://internal/ab-registry-cache-v1`);
  const cache = caches.default;
  
  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const cachedRegistry = await cachedResponse.json();
      if (Array.isArray(cachedRegistry)) {
        // Update in-memory cache
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
    // Check KV namespace availability once
    if (!checkKVNamespace(env)) {
      return [];
    }
    
    // Add timeout for KV operations
    const kvPromise = env.AB_TESTS_KV.get("registry", { type: "json" });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('KV timeout')), CONFIG.KV_TIMEOUT_MS)
    );
    
    const registry = await Promise.race([kvPromise, timeoutPromise]);
    if (!registry || !Array.isArray(registry)) {
      logInfo(env, 'No valid registry found');
      // Cache empty result for shorter time to avoid hammering KV
      registryCache = [];
      registryCacheTime = now;
      return [];
    }
    
    // Validate registry structure
    const validRegistry = registry.filter(test => {
      return test && 
             typeof test.test === 'string' && 
             typeof test.cookieName === 'string' && 
             Array.isArray(test.paths) && 
             test.paths.length > 0;
    });
    
    if (validRegistry.length !== registry.length) {
      logWarn(env, `Registry validation: ${registry.length - validRegistry.length} invalid entries filtered`);
    }
    
    // Cache the successful result in both memory and Cache API with immutable copy
    registryCache = Object.freeze(validRegistry.map(test => Object.freeze({...test})));
    registryCacheTime = now;
    logInfo(env, 'Registry loaded from KV and cached:', validRegistry.length, 'tests');
    
    // Store in Cache API for global consistency
    const cacheResponse = new Response(JSON.stringify(validRegistry), {
      headers: { 
        'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}, stale-while-revalidate=${CONFIG.REGISTRY_CACHE_TTL}`,
        'Content-Type': 'application/json',
        'CDN-Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`
      }
    });
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));
    
    kvFailureCount = 0; // Reset failure count on success
    return registry;
    
  } catch (error) {
    logError('Registry fetch failed:', error);
    kvFailureCount++; // Increment failure count
    
    // Return cached data if available, even if stale
    if (registryCache) {
      const staleness = Math.round((now - registryCacheTime) / 1000);
      logWarn(env, `Using stale cached registry (${staleness}s old) due to fetch error`);
      return registryCache;
    }
    
    return [];
  }
}

function findMatchingTest(pathname, registry) {
  return registry.find(test => {
    return test.paths && Array.isArray(test.paths) && test.paths.some(path => {
      if (pathname === path) return true;
      const normalizedPath = path.endsWith('/') ? path : path + '/';
      return pathname.startsWith(normalizedPath);
    });
  });
}

async function handleABTestWithTimeout(request, url, test, env) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
  
  try {
    const headers = new Headers(request.headers);
    let variant = getVariantFromRequest(request, test.cookieName);
    
    // Generate variant if not set
    if (!variant) {
      variant = await generateVariant(request);
    }
    
    // Add variant headers for origin (both specific and generic)
    headers.set('X-' + test.cookieName, variant);
    headers.set('X-AB-Variant', variant);
    
    // Create modified request
    const modifiedRequest = new Request(request, { headers });
    
    // Get response from origin with timeout
    const response = await fetch(modifiedRequest, {
      signal: controller.signal
    });
    
    // Get the response text to inject meta tag
    let html = await response.text();
    
    // Inject meta tag with variant into HTML head for JavaScript to read
    // HTML-escape values to prevent XSS vulnerabilities
    // Only replace the first <head> occurrence to handle malformed HTML safely
    if (html.includes('<head>')) {
      const escapedVariant = escapeHtml(variant);
      const escapedTestName = escapeHtml(test.test);
      const metaTag = `<meta name="cf-ab-variant" content="${escapedVariant}">\n<meta name="cf-ab-test" content="${escapedTestName}">`;
      html = html.replace('<head>', `<head>\n${metaTag}`);
    }
    
    // Create response with modified HTML
    const newResponse = new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    
    // Set A/B test cookie with security flags - HttpOnly prevents XSS access
    // JavaScript reads variant from meta tags, not cookies
    newResponse.headers.set('Set-Cookie', 
      `${test.cookieName}=${variant}; Path=/; Max-Age=${CONFIG.COOKIE_MAX_AGE}; SameSite=Lax; Secure; HttpOnly`);
    
    // Add cache-aware headers - prevent WordPress from serving wrong variant
    newResponse.headers.set('Vary', 'Cookie');
    newResponse.headers.set('X-Worker-Active', 'true');
    newResponse.headers.set('X-AB-Test', test.test);
    newResponse.headers.set('X-AB-Variant', variant);
    
    // Debug headers for easier troubleshooting
    if (env?.DEBUG) {
      newResponse.headers.set('X-AB-Debug-Cookie', `${test.cookieName}=${variant}`);
      newResponse.headers.set('X-AB-Debug-Generated', variant === getVariantFromRequest(request, test.cookieName) ? 'false' : 'true');
      newResponse.headers.set('X-AB-Debug-Meta-Injected', 'true');
    }
    
    return newResponse;
    
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

function getVariantFromRequest(request, cookieName) {
  const url = new URL(request.url);
  
  // Check URL parameter first (for testing/debugging)
  const urlVariant = url.searchParams.get(cookieName);
  if (CONFIG.VALID_VARIANTS.includes(urlVariant)) {
    return urlVariant;
  }
  
  // Check cookie - more robust parsing with cached regex
  const cookies = request.headers.get('Cookie') || '';
  if (cookies) {
    // Memory optimization: Clear cookieRegexCache when it exceeds 50 entries
    if (cookieRegexCache.size > 50) {
      cookieRegexCache.clear();
    }
    // Use cached regex or create and cache new one
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

async function generateVariant(request) {
  // Get user identifier components for deterministic assignment
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
             '127.0.0.1';
  
  const userAgent = request.headers.get('User-Agent') || '';
  const cfRay = request.headers.get('CF-Ray') || '';
  
  // Create deterministic input string
  const input = `${ip}|${userAgent.substring(0, 50)}|${cfRay}`;
  
  try {
    // Use WebCrypto SHA-256 for unbiased hash
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    
    // Use first byte for 50/50 split (more mathematically sound)
    return (hashArray[0] % 2) === 0 ? 'A' : 'B';
  } catch (error) {
    // Fallback to simple hash if WebCrypto fails
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
    }
    return (hash % 2) === 0 ? 'A' : 'B';
  }
}
