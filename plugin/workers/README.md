# Cloudflare Worker Files

This directory contains the Cloudflare Worker scripts used for A/B testing.

## Worker Versions

### `ab-testing.js` - Production-Ready Baseline (Recommended)
- Proven 100% A/B synchronization (headers/content match)
- KV registry caching with in-memory layer
- WordPress-specific bypasses for admin, REST API, system paths
- Static file optimization via pre-compiled extensions set
- Secure cookies (Secure/HttpOnly/SameSite=Lax)
- Deterministic variant assignment using WebCrypto SHA-256
- Timeout protection (request: 10s, KV: 5s)
- Circuit breaker for repeated KV failures

Use when: you want reliable A/B testing with proven synchronization.

### `ab-testing-with-cache.js` - Enhanced with Caching
- All baseline features plus advanced caching capabilities
- Multi-layer caching: In-memory → Cache API (v1 key) → KV
- Cache API no-test path caching to avoid redundant KV reads
- WordPress-optimized bypasses (logged-in, password-protected, comments, search/preview/customizer)
- POST/HEAD handling with proper bypass logic
- Global cache consistency across instances
- Debug headers gated by env.DEBUG

Use when: you want maximum performance with WordPress-specific optimizations.

## Key Features (Both Versions)

- Deterministic variant assignment (WebCrypto SHA-256, with safe fallback)
- KV namespace integration with availability check
- WordPress integration (bypass admin and logged-in users)
- Static file bypass (CSS, JS, images, fonts, etc.)
- Cookie management with secure flags
- Response headers: X-Worker-Active, X-AB-Test, X-AB-Variant, Vary: Cookie

## Performance/Behavior Comparison

| Feature | Baseline Worker | Cache Worker |
|---------|------------------|--------------|
| Core A/B Testing | ✅ | ✅ |
| 100% Header-Content Sync | ✅ | ✅ |
| Request Timeout Protection | ✅ | ✅ |
| Secure Cookies | ✅ | ✅ |
| In-Memory KV Caching | ✅ | ✅ |
| KV Circuit Breaker | ✅ | ✅ |
| Cache API Registry (v1 key) | ✅ | ✅ |
| Cache API No-Test Paths | ❌ | ✅ |
| WordPress Bypass Logic | ✅ | ✅ Enhanced |
| Debug Headers (env.DEBUG) | ✅ | ✅ |
| Production Ready | ✅ | ✅ |

## Critical Fix Applied to Both Workers

X-AB-Variant Request Header: both workers include the request header to ensure WordPress receives the active variant:

headers.set('X-AB-Variant', variant);

This achieves 100% header-content synchronization in testing.

## Installation

These worker files are deployed by the WordPress plugin. You don’t need to upload them manually to Cloudflare.
