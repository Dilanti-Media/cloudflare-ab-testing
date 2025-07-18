export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

const CONFIG = {
  TIMEOUT_MS: 30000,
  COOKIE_MAX_AGE: 31536000, // 1 year
  VALID_VARIANTS: ['A', 'B'],
  MAX_COOKIE_SIZE: 8192,
  REGISTRY_CACHE_TTL: 300 // 5 minutes
};

// Pre-compile regex and sets for performance
const STATIC_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 
  'css', 'js', 'woff', 'woff2', 'ttf', 'eot',
  'pdf', 'zip', 'ico', 'xml', 'txt'
]);

const BYPASS_PATHS = ['/wp-admin/', '/wp-json/', '/wp-login', '/wp-content/', '/wp-includes/'];

// Check KV namespace binding once at module load
let kvNamespaceAvailable = null;

// In-memory cache for KV registry
let registryCache = null;
let registryCacheTime = 0;

// Cache for common paths that have no tests (to avoid KV lookups)
// Using Map to store individual timestamps for each path
const noTestCache = new Map(); // path -> timestamp

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
if (!CONFIG.TIMEOUT_MS) {
  throw new Error('Invalid worker configuration');
}

// Check KV namespace availability once
function checkKVNamespace(env) {
  if (kvNamespaceAvailable === null) {
    kvNamespaceAvailable = typeof env.AB_TESTS_KV !== 'undefined';
    if (!kvNamespaceAvailable) {
      logWarn('KV namespace not bound - A/B testing disabled');
    }
  }
  return kvNamespaceAvailable;
}

logInfo('Simple A/B Testing Worker initialized');

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const now = Date.now();
  
  try {
    // Skip processing for WordPress admin, REST API, system paths, or static files
    if (shouldBypassProcessing(url, request)) {
      return fetch(request);
    }

    // Check if this path is known to have no tests (avoid KV call)
    const pathCacheTime = noTestCache.get(pathname);
    if (pathCacheTime && (now - pathCacheTime) < (CONFIG.REGISTRY_CACHE_TTL * 1000)) {
      return fetch(request);
    }

    // Get A/B test registry (cached)
    const registry = await getTestRegistry(env);
    if (!registry || registry.length === 0) {
      return fetch(request);
    }

    // Find matching test for current path
    const matchingTest = findMatchingTest(pathname, registry);
    if (!matchingTest) {
      // Cache this path as having no tests with individual timestamp
      noTestCache.set(pathname, now);
      
      // Implement LRU eviction to prevent memory issues
      if (noTestCache.size > 100) {
        // Find and remove oldest entry
        let oldestPath = null;
        let oldestTime = Infinity;
        
        for (const [path, time] of noTestCache) {
          if (time < oldestTime) {
            oldestTime = time;
            oldestPath = path;
          }
        }
        
        if (oldestPath) {
          noTestCache.delete(oldestPath);
        }
      }
      
      return fetch(request);
    }

    // Handle A/B test logic with timeout
    return handleABTestWithTimeout(request, url, matchingTest, env);
    
  } catch (error) {
    logError('Worker error:', error);
    return fetch(request);
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
    logWarn('Cookie header too large, bypassing');
    return true;
  }
  
  return false;
}

async function getTestRegistry(env) {
  const now = Date.now();
  
  // Check in-memory cache first (fastest)
  if (registryCache && (now - registryCacheTime) < (CONFIG.REGISTRY_CACHE_TTL * 1000)) {
    return registryCache;
  }
  
  // Check Cache API for global consistency across instances
  const cacheKey = new Request('https://internal/ab-registry-cache');
  const cache = caches.default;
  
  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const cachedRegistry = await cachedResponse.json();
      if (Array.isArray(cachedRegistry)) {
        // Update in-memory cache
        registryCache = cachedRegistry;
        registryCacheTime = now;
        logInfo('Registry loaded from Cache API:', cachedRegistry.length, 'tests');
        return cachedRegistry;
      }
    }
  } catch (error) {
    logWarn('Cache API read failed:', error);
  }
  
  try {
    // Check KV namespace availability once
    if (!checkKVNamespace(env)) {
      return [];
    }
    
    const registry = await env.AB_TESTS_KV.get("registry", { type: "json" });
    if (!registry || !Array.isArray(registry)) {
      logInfo('No valid registry found');
      // Cache empty result for shorter time to avoid hammering KV
      registryCache = [];
      registryCacheTime = now;
      return [];
    }
    
    // Cache the successful result in both memory and Cache API
    registryCache = registry;
    registryCacheTime = now;
    logInfo('Registry loaded from KV and cached:', registry.length, 'tests');
    
    // Store in Cache API for global consistency
    const cacheResponse = new Response(JSON.stringify(registry), {
      headers: { 
        'Cache-Control': `max-age=${CONFIG.REGISTRY_CACHE_TTL}`,
        'Content-Type': 'application/json'
      }
    });
    await cache.put(cacheKey, cacheResponse).catch(e => 
      logWarn('Cache API write failed:', e)
    );
    
    return registry;
    
  } catch (error) {
    logError('Registry fetch failed:', error);
    
    // Return cached data if available, even if stale
    if (registryCache) {
      const staleness = Math.round((now - registryCacheTime) / 1000);
      logWarn(`Using stale cached registry (${staleness}s old) due to fetch error`);
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
      variant = generateVariant(request);
    }
    
    // Add variant header for origin
    headers.set('X-' + test.cookieName, variant);
    
    // Create modified request
    const modifiedRequest = new Request(request, { headers });
    
    // Get response from origin with timeout
    const response = await fetch(modifiedRequest, {
      signal: controller.signal
    });
    
    // Create response with A/B cookie
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    
    // Set A/B test cookie with security flags
    newResponse.headers.set('Set-Cookie', 
      `${test.cookieName}=${variant}; Path=/; Max-Age=${CONFIG.COOKIE_MAX_AGE}; SameSite=Lax; Secure; HttpOnly`);
    
    // Add debug headers
    newResponse.headers.set('X-Worker-Active', 'true');
    newResponse.headers.set('X-AB-Test', test.test);
    newResponse.headers.set('X-AB-Variant', variant);
    
    return newResponse;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      logWarn('Request timeout, falling back to origin');
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
  
  // Check cookie - more robust parsing
  const cookies = request.headers.get('Cookie') || '';
  if (cookies) {
    const cookieRegex = new RegExp(`(?:^|; )${cookieName}=([AB])(?:;|$)`);
    const match = cookies.match(cookieRegex);
    if (match && CONFIG.VALID_VARIANTS.includes(match[1])) {
      return match[1];
    }
  }
  
  return null;
}

function generateVariant(request) {
  // Get user identifier components for deterministic assignment
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
             '127.0.0.1';
  
  const userAgent = request.headers.get('User-Agent') || '';
  const cfRay = request.headers.get('CF-Ray') || '';
  
  // Hash components individually to avoid string concatenation
  let hash = 0;
  
  // Hash IP address
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
  }
  
  // Hash first 50 chars of user agent for performance
  const ua = userAgent.substring(0, 50);
  for (let i = 0; i < ua.length; i++) {
    hash = ((hash << 5) - hash) + ua.charCodeAt(i);
  }
  
  // Hash CF-Ray for additional entropy
  for (let i = 0; i < cfRay.length; i++) {
    hash = ((hash << 5) - hash) + cfRay.charCodeAt(i);
  }
  
  // Convert to 32-bit integer and use modulo for 50/50 split
  hash = hash & 0x7fffffff; // Ensure positive 32-bit integer
  return (hash % 2) === 0 ? 'A' : 'B';
}