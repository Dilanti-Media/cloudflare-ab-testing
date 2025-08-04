=== Cloudflare A/B Testing ===
Contributors: dilantimedia
Tags: ab-testing, cloudflare, workers, performance, optimization
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 2.0.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Advanced A/B testing plugin using Cloudflare Workers with multi-layer caching and performance optimizations.

== Description ==

The Cloudflare A/B Testing plugin provides comprehensive A/B testing capabilities using Cloudflare Workers. It features automatic worker deployment, domain auto-detection, and advanced caching optimizations.

= Features =

* Automatic Worker Deployment
* Two Worker Versions (Full & Simple)
* Domain Auto-Detection
* Advanced Multi-layer Caching
* Real-time Status Monitoring
* Security Best Practices

= Requirements =

* Cloudflare account with Workers enabled
* Valid Cloudflare API token
* WordPress 5.0+
* PHP 7.4+

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/cloudflare-ab-testing/`
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Configure your Cloudflare credentials in A/B Tests → Settings
4. Deploy workers and configure tests

== Changelog ==

= 2.0.4 =
* **Critical Fix**: Plugin updater filesystem path compatibility
* **Fixed**: Use WP_CONTENT_DIR constant for consistent path handling
* **Enhanced**: Added file verification and detailed error messages
* **Improved**: Proper file permissions using FS_CHMOD_FILE
* **Resolved**: Update download and installation failures

= 2.0.3 =
* **Fixed**: Plugin updater filesystem compatibility for both admin and CLI environments
* **Enhanced**: Robust WP_Filesystem detection with automatic maintenance cleanup
* **Improved**: GitHub release asset handling and update detection
* **Tested**: Comprehensive updater validation with test releases

= 2.0.0 =
* **BREAKING**: Major version update with enhanced GA4 tracking implementation
* **Fixed**: Critical gtag integration issue preventing proper GA4 event tracking
* **Enhanced**: Added comprehensive error handling and input validation
* **Improved**: Simplified tracking code (29% size reduction)
* **Validated**: Perfect 50/50 distribution across 50K samples and 10 live proxies
* **Added**: ReDoS protection for cookie handling
* **Added**: Complete IDE formatting configuration (PHPStorm/WebStorm compatible)
* **Added**: ESLint configuration for code quality

= 1.1.0 =
* Feature: Add GitHub Action for automatic releases.
* Fix: General improvements and updates.

= 1.0.0 =
* Initial release
* Advanced worker deployment system
* Multi-layer caching optimizations
* Security enhancements
