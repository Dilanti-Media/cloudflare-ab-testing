# Cloudflare A/B Testing Plugin

A comprehensive WordPress plugin for A/B testing using Cloudflare Workers with advanced caching and performance optimizations.

[![License](https://img.shields.io/badge/License-GPL%202.0%2B-blue.svg)](https://www.gnu.org/licenses/gpl-2.0)
[![WordPress](https://img.shields.io/badge/WordPress-5.0%2B-blue.svg)](https://wordpress.org/)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-blue.svg)](https://php.net/)

## Features

- **🚀 Automatic Worker Deployment**: Deploy A/B testing workers directly from WordPress admin
- **⚡ Two Worker Versions**: Choose between full-featured caching or lightweight workers
- **🎯 Domain Auto-Detection**: Automatically detects and deploys to the correct Cloudflare zone
- **📊 KV Namespace Management**: Create and manage Cloudflare KV namespaces seamlessly
- **📈 Real-time Status Monitoring**: Monitor worker status and routes in real-time
- **🔧 Debug Tools**: Built-in diagnostics and testing tools for troubleshooting
- **🛡️ Security Best Practices**: Implements security headers and validation
- **⚡ Performance Optimized**: Multi-layer caching for maximum performance

## Quick Start

### Installation

1. **Download the latest release** from [GitHub Releases](https://github.com/Dilanti-Media/cloudflare-ab-testing/releases)
2. **Upload to WordPress**: Go to `WordPress Admin → Plugins → Add New → Upload Plugin`
3. **Activate the plugin**
4. **Configure Cloudflare credentials** in `A/B Tests → Settings`

### Basic Setup

1. **Create API Token** at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create KV Namespace** in the plugin's Diagnostics page
3. **Deploy Worker** using the Worker Management page
4. **Configure Tests** and add shortcodes to your content

## Worker Versions

### Full Version (`ab-cache-worker.js`)
- ✅ Advanced multi-layer caching system
- ✅ Static asset optimization
- ✅ Request coalescing
- ✅ Comprehensive error handling
- ✅ Production-ready for high traffic
- ✅ Performance monitoring

### Simple Version (`ab-simple-worker.js`)
- ✅ Basic A/B testing functionality
- ✅ Lightweight and easy to understand
- ✅ No complex caching features
- ✅ Good for low-traffic sites or testing
- ✅ Quick deployment

## Usage

### Creating A/B Tests

1. Go to **A/B Tests → Diagnostics** in WordPress admin
2. Add test configuration to the KV namespace:

```json
[
  {
    "test": "homepage_cta_test",
    "paths": ["/", "/home"],
    "cookieName": "AB_CTA_BUTTON_TEST"
  }
]
```

3. Use shortcodes in your content:

```html
[ab_test a="Original Button" b="New Button Text"]
[ab_test_debug]
```

### Advanced Configuration

For detailed configuration options, see the [Installation Guide](docs/installation.md).

## Development

### Prerequisites

- Node.js 16+
- PHP 7.4+
- Composer (for PHP dependencies)
- WordPress development environment

### Setup

```bash
# Clone the repository
git clone https://github.com/Dilanti-Media/cloudflare-ab-testing.git
cd cloudflare-ab-testing

# Install dependencies
npm install

# Run tests
npm test

# Build for distribution
npm run build
```

### Available Scripts

- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run build` - Build plugin for distribution
- `npm run lint:js` - Lint JavaScript files
- `npm run lint:php` - Lint PHP files (requires phpcs)
- `npm run format` - Format JavaScript files

### Testing

```bash
# Run all tests
npm test

# Run PHP tests (requires WordPress test suite)
phpunit tests/unit/

# Run JavaScript tests
npm run test:watch
```

## File Structure

```
cloudflare-ab-testing/
├── plugin/                          # Main plugin files
│   ├── cloudflare-ab-testing.php    # Main plugin file
│   ├── assets/js/                   # Frontend JavaScript
│   └── workers/                     # Cloudflare Worker scripts
├── tests/                           # Test files
│   ├── unit/                        # PHPUnit tests
│   └── fixtures/                    # Test fixtures
├── docs/                            # Documentation
├── scripts/                         # Build scripts
└── releases/                        # Built plugin releases
```

## Requirements

- **WordPress**: 5.0 or higher
- **PHP**: 7.4 or higher
- **Cloudflare Account**: With Workers and KV enabled
- **API Token**: With appropriate permissions

### Required Cloudflare API Token Permissions

- Zone:Zone:Read
- Zone:Zone Settings:Edit
- Account:Cloudflare Workers:Edit
- Account:Account Analytics:Read

## Troubleshooting

### Common Issues

**Worker not deploying:**
- Verify Cloudflare credentials
- Check API token permissions
- Ensure domain is managed by Cloudflare

**No A/B testing happening:**
- Check KV namespace binding
- Verify test configuration format
- Ensure path matching in registry

**Performance issues:**
- Use the Full Version worker for high-traffic sites
- Monitor worker logs in Cloudflare dashboard
- Check cache hit rates

### Debug Mode

Add `?__cf_bypass_cache=1` to any URL to see debug headers:
- `X-Worker-Active: true`
- `X-AB-Test: test_name`
- `X-AB-Variant: A` or `B`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## Support

- 📖 [Installation Guide](docs/installation.md)
- 🐛 [Report Issues](https://github.com/Dilanti-Media/cloudflare-ab-testing/issues)
- 💬 [Discussions](https://github.com/Dilanti-Media/cloudflare-ab-testing/discussions)

## License

This project is licensed under the GPL-2.0+ License. See the [LICENSE](LICENSE) file for details.

## Author

**Dilanti Media**
- Website: [dilantimedia.com](https://dilantimedia.com/)
- GitHub: [@Dilanti-Media](https://github.com/Dilanti-Media)

---

Made with ❤️ for the WordPress community