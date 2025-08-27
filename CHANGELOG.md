# Changelog

## [2.1.9] - 2025-08-27

### 🚀 Features
- Cache worker aligned with baseline defaults; added env DEBUG, registry validation, and debug headers
- Multi-layer caching: in-memory + Cache API (v1) + KV with no-test path caching

### 🔧 Improvements
- Robust variant generation using WebCrypto SHA-256 with unsigned 32-bit fallback
- Circuit breaker for KV failures and explicit KV timeouts
- Configurable cookie regex cache size (COOKIE_REGEX_CACHE_MAX_SIZE)
- WordPress-specific bypasses expanded (preview/customizer/comments/password/search)

### 🧪 Tests
- Added Miniflare integration tests (headers/cookies, bypasses, URL param forcing, debug headers, Cache API no-test persistence)
- Added Jest parity checks for worker headers/cookies and config flags
- Updated GA4 test with env var name constants and broader analytics endpoints

### 🐛 Fixes
- Ensured unsigned fallback hashing for consistent 50/50 distribution
- Synced WordPress worker copy with plugin worker to prevent drift

---

## [1.5.1] - 2025-07-30

### 🐛 Bug Fixes
- **Fixed empty version number in update notifications** - Previously displayed "Update to ." instead of actual version number
- **Enhanced GitHub API error handling** - Added comprehensive error logging and validation
- **Improved compatibility display** - Added parsing of compatibility information from release notes

### 🔧 Technical Improvements
- Enhanced version extraction from GitHub releases
- Added robust version format validation with regex
- Updated plugin updater with better error handling and debugging
- Improved upgrade notice extraction from release notes

### 📋 Requirements
- **WordPress**: Requires at least 5.0, Tested up to 6.8.2
- **PHP**: Requires PHP 7.4 or higher

## [1.5.0] - 2025-07-29

### 🚀 Features
- Initial production-ready release
- Full GitHub integration for automatic updates
- Cloudflare Workers integration
- A/B testing capabilities with KV storage
- Debug-controlled logging system
- Admin interface for worker management
