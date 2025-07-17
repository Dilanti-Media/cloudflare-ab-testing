# Cloudflare A/B Testing WordPress Plugin

[![License: GPL v2+](https://img.shields.io/badge/License-GPL%20v2%2B-blue.svg)](LICENSE)
[![WordPress](https://img.shields.io/badge/WordPress-5.0%2B-blue.svg)](https://wordpress.org)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-blue.svg)](https://php.net)

A comprehensive WordPress plugin for A/B testing using Cloudflare Workers with advanced caching and performance optimizations.

## 🚀 Features

- **Automatic Worker Deployment**: Deploy A/B testing workers directly from WordPress
- **Two Worker Versions**: Choose between full-featured or lightweight workers
- **Domain Auto-Detection**: Automatically detects and deploys to the correct Cloudflare zone
- **Advanced Caching**: Multi-layer caching with KV registry and path-based optimizations
- **Real-time Monitoring**: Worker status and route monitoring
- **Security First**: Secure cookies, input validation, and safe deployment practices

## 📦 Installation

### Quick Install (Recommended)

1. **Download the plugin**:
   ```bash
   wget https://github.com/YOUR_USERNAME/cloudflare-ab-testing/archive/main.zip
   unzip main.zip
   ```

2. **Copy plugin folder**:
   ```bash
   cp -r cloudflare-ab-testing-main/plugin/ /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
   ```

3. **Activate in WordPress**:
   - Go to **Plugins** → **Installed Plugins**
   - Find "Cloudflare A/B Testing" and click **Activate**

### Development Install

```bash
git clone https://github.com/YOUR_USERNAME/cloudflare-ab-testing.git
cd cloudflare-ab-testing
cp -r plugin/ /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
```

## ⚙️ Configuration

### 1. Cloudflare Credentials
- **Account ID**: Your Cloudflare account ID
- **API Token**: Create a token with Worker and Zone permissions

### 2. Worker Selection
- **Full Version**: Advanced caching, static asset optimization, production-ready
- **Simple Version**: Lightweight, optimized for basic A/B testing

### 3. Test Configuration
Add A/B test configurations via **A/B Tests** → **Diagnostics**

## 🧪 Testing

Run the test suite:

```bash
# PHP unit tests
composer test

# Worker function tests  
npm test

# Integration tests
./scripts/test-workers.sh
```

## 📚 Documentation

- [Installation Guide](docs/installation.md)
- [Configuration Guide](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [API Reference](docs/api-reference.md)

## 🏗️ Development

### Repository Structure

```
cloudflare-ab-testing/
├── plugin/                 # WordPress plugin files (distributable)
├── tests/                  # Test files
├── docs/                   # Documentation  
├── scripts/                # Build and deployment scripts
└── .github/                # CI/CD workflows
```

### Building Plugin Zip

```bash
./scripts/build-plugin.sh
# Creates: releases/cloudflare-ab-testing-v1.0.0.zip
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes in the `plugin/` directory
4. Add tests in the `tests/` directory
5. Run tests: `composer test && npm test`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push to branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

## 🔧 Worker Versions

### Full Version (`ab-cache-worker.js`)
- Advanced caching system
- Static asset optimization
- Request coalescing
- Production-ready for high traffic

### Simple Version (`ab-simple-worker.js`)  
- Multi-layer KV caching
- Path-based optimization
- LRU cache eviction
- Lightweight and efficient

## 📋 Requirements

- WordPress 5.0+
- PHP 7.4+
- Cloudflare account with Workers enabled
- Valid Cloudflare API token

## 📝 License

This project is licensed under the GPL v2+ License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/cloudflare-ab-testing/issues)
- **Documentation**: [docs/](docs/)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/cloudflare-ab-testing/discussions)

## 🎯 Roadmap

- [ ] WordPress.org plugin store submission
- [ ] Advanced analytics integration
- [ ] Multi-variant testing (A/B/C/D)
- [ ] Geographic targeting
- [ ] Time-based test scheduling

---

**Made with ❤️ for the WordPress community**