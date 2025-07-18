# Cloudflare A/B Testing Plugin

A comprehensive WordPress plugin for A/B testing using Cloudflare Workers.

## Features

- **Automatic Worker Deployment**: Deploy A/B testing workers directly from WordPress
- **Two Worker Versions**: Choose between full-featured or lightweight workers
- **Domain Auto-Detection**: Automatically detects and deploys to the correct Cloudflare zone
- **KV Namespace Management**: Create and manage Cloudflare KV namespaces
- **Real-time Status Monitoring**: Monitor worker status and routes
- **Debug Tools**: Built-in diagnostics and testing tools

## Installation

1. Download the plugin files
2. Upload to your WordPress `wp-content/plugins/` directory
3. Activate the plugin in WordPress admin
4. Configure your Cloudflare credentials in the plugin settings

## Configuration

### 1. Cloudflare Credentials
- **Account ID**: Your Cloudflare account ID
- **API Token**: Create a token with Worker and Zone permissions

### 2. KV Namespace
- Create or select a KV namespace for storing A/B test configurations
- The plugin will automatically bind this to your workers

### 3. Worker Deployment
- Choose between Full Version (with caching) or Simple Version (lightweight)
- Worker will be automatically deployed to the detected domain

## Worker Versions

### Full Version
- Advanced caching system with cache keys
- Static asset optimization
- Request coalescing
- Comprehensive error handling
- Production-ready for high traffic

### Simple Version
- Basic A/B testing functionality
- Lightweight and easy to understand
- No complex caching features
- Good for low-traffic sites or testing

## Usage

### Creating A/B Tests

1. Go to **A/B Tests** → **Diagnostics** in WordPress admin
2. Add test configuration to the KV namespace
3. Use shortcodes in your content:
   ```
   [ab_test a="Variant A" b="Variant B"]
   [ab_test_debug]
   ```

### Test Configuration Format

```json
[
  {
    "test": "homepage_cta_test",
    "paths": ["/", "/home"],
    "cookieName": "AB_CTA_BUTTON_TEST"
  }
]
```

## File Structure

```
cloudflare-ab-testing/
├── cloudflare-ab-testing.php    # Main plugin file
├── workers/
│   ├── ab-testing-with-cache.js # Full version worker
│   ├── ab-testing.js            # Simple version worker
│   └── README.md                # Worker documentation
├── assets/
│   └── js/
│       └── cloudflare-ab-testing.js  # Admin interface JS
└── README.md                    # This file
```

## Requirements

- WordPress 5.0+
- PHP 7.4+
- Cloudflare account with Worker and KV enabled
- Valid Cloudflare API token

## Support

For issues and questions:
1. Check the built-in diagnostic tools
2. Review the worker logs in Cloudflare dashboard
3. Verify your API token permissions

## License

GPL-2.0+