# Cloudflare Worker Files

This directory contains the Cloudflare Worker scripts used for A/B testing.

## Worker Versions

### `ab-testing.js` - Production-Ready Baseline (Recommended)
- **Proven 100% A/B synchronization** - Headers/content always match
- **Optimized KV registry caching** with in-memory layer
- **WordPress-specific bypasses** for admin, REST API, system paths
- **Static file optimization** with pre-compiled extensions set
- **Enhanced security** with Secure/HttpOnly cookies
- **Performance optimizations**:
  - **LRU eviction** for memory-efficient path caching
  - **One-time KV namespace check** (not per request)
  - **Stale cache fallback** with detailed logging
  - **Pre-compiled regex and Sets** for fast lookups
  - **Optimized variant generation** (no string concatenation)
- **Robust error handling** and timeout protection (10s/5s)

**Use when:** You want reliable A/B testing with proven synchronization.

### `ab-testing-with-cache.js` - Enhanced with Caching
- **All baseline features** plus advanced caching capabilities
- **Multi-layer caching system**: In-memory → Cache API → KV
- **WordPress-optimized bypasses** for dynamic content
- **Enhanced logged-in user detection** (wordpress_logged_in_, wp-postpass_)
- **Search and preview bypass** for WordPress-specific queries
- **Comment author bypass** for personalized content
- **Global cache consistency** across worker instances
- **POST request handling** with proper bypass logic

**Use when:** You need maximum performance with WordPress-specific optimizations.

## Key Features (Both Versions)

✅ **Deterministic variant assignment** - Same user gets same variant
✅ **KV namespace integration** - Dynamic test registry loading
✅ **WordPress integration** - Bypasses admin pages and logged-in users
✅ **Static file bypass** - Skips processing for CSS, JS, images
✅ **Cookie management** - Sets A/B test cookies automatically
✅ **Debug headers** - X-Worker-Active, X-AB-Test, X-AB-Variant

## Worker Selection

The plugin automatically selects the appropriate worker based on your configuration in the WordPress admin interface.

## Performance Comparison

| Feature | Baseline Worker | Cache Worker |
|---------|--------------|-------------|
| **Core A/B Testing** | ✅ | ✅ |
| **100% Header-Content Sync** | ✅ | ✅ |
| **Request Timeout Protection** | ✅ | ✅ |
| **Secure Cookies** | ✅ | ✅ |
| **In-Memory KV Caching** | ✅ | ✅ |
| **LRU Path Cache Eviction** | ✅ | ✅ |
| **One-time KV Namespace Check** | ✅ | ✅ |
| **Stale Cache Fallback** | ✅ | ✅ |
| **Pre-compiled Regex/Sets** | ✅ | ✅ |
| **Optimized Variant Generation** | ✅ | ✅ |
| **WordPress Bypass Logic** | ✅ | ✅ Enhanced |
| **Cache API Integration** | ❌ | ✅ |
| **Enhanced Cookie Detection** | ❌ | ✅ |
| **Search/Preview Bypass** | ❌ | ✅ |
| **Comment Author Bypass** | ❌ | ✅ |
| **Production Ready** | ✅ | ✅ |
| **Code Size** | ~387 lines | ~387 lines |

## Critical Fix Applied to Both Workers

🚨 **X-AB-Variant Request Header**: Both workers now include the critical fix that ensures WordPress receives the variant as a request header:
```javascript
headers.set('X-AB-Variant', variant);
```

This fix achieved **100% header-content synchronization** in all testing scenarios.

## Installation

These worker files are automatically deployed by the WordPress plugin. You don't need to manually upload them to Cloudflare.