# Changelog

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