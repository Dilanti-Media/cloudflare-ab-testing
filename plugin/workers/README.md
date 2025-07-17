# Cloudflare Worker Files

This directory contains the Cloudflare Worker scripts used for A/B testing.

## Worker Versions

### `ab-cache-worker.js` - Full Version (Recommended)
- **Advanced caching system** with cache keys for different variants
- **Sophisticated error handling** with timeout management
- **Static asset optimization** with proper cache headers
- **Request coalescing** to reduce origin load
- **Comprehensive logging** and debugging features
- **Production-ready** for high-traffic websites

**Use when:** You need maximum performance and have high traffic volume.

### `ab-simple-worker.js` - Lightweight Version
- **Basic A/B testing** functionality only
- **Simple request handling** without advanced caching
- **Minimal resource usage** (~351 lines vs 557 lines)
- **Easy to understand** and modify
- **Request timeout protection** (30 seconds)
- **Enhanced security** with Secure/HttpOnly cookies
- **Advanced performance optimizations**:
  - **Multi-layer caching**: In-memory → Cache API → KV
  - **Global cache consistency** across worker instances
  - **Individual path timestamps** for precise TTL handling
  - **LRU eviction** for memory-efficient path caching
  - **One-time KV namespace check** (not per request)
  - **Stale cache fallback** with detailed logging
  - **Pre-compiled regex and Sets** for fast lookups
  - **Optimized variant generation** (no string concatenation)
- **Robust error handling** and fallback mechanisms

**Use when:** You want simple A/B testing without complex caching needs.

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

| Feature | Simple Worker | Cache Worker |
|---------|--------------|-------------|
| A/B Testing | ✅ | ✅ |
| Request Timeout Protection | ✅ | ✅ |
| Secure Cookies | ✅ | ✅ |
| Multi-layer KV Caching | ✅ | ✅ |
| Cache API Integration | ✅ | ❌ |
| Individual Path Timestamps | ✅ | ❌ |
| LRU Path Cache Eviction | ✅ | ❌ |
| One-time KV Namespace Check | ✅ | ❌ |
| Stale Cache Fallback | ✅ | ❌ |
| Pre-compiled Regex/Sets | ✅ | ✅ |
| Optimized Variant Generation | ✅ | ❌ |
| Advanced Response Caching | ❌ | ✅ |
| Static Asset Optimization | ❌ | ✅ |
| Request Coalescing | ❌ | ✅ |
| Production Ready | ✅ | ✅ |
| Code Size | ~351 lines | ~557 lines |

## Installation

These worker files are automatically deployed by the WordPress plugin. You don't need to manually upload them to Cloudflare.