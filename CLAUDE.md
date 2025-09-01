# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a production-ready WordPress plugin for A/B testing using Cloudflare Workers. It provides both full-featured and lightweight worker versions, automated deployment, and a consolidated test suite.

## ⚡ Quick Development Setup

### Prerequisites
- WordPress website using Cloudflare
- Cloudflare Workers plan (Free tier sufficient for testing)
- Node.js and npm for build tools

### Fast Setup Commands
```bash
# Install dependencies
npm install

# Sync plugin to WordPress for testing
./sync-to-wordpress.sh

# Run tests
npm test                     # Unit & integration (Jest)
npm run test:proxy:all       # All E2E proxy tests
```

## 🔧 Development Commands

### Building and Testing
- `npm run build` - Build plugin for distribution using `./scripts/build-plugin.sh`
- `npm test` - Run Jest tests (unit/integration)
- `npm run test:watch` - Run Jest tests in watch mode
- `npm run test:proxy:all` - Run all E2E proxy tests
- `npm run test:all` - Run unit + E2E in one command

### Linting and Formatting
- `npm run lint:js` - Lint JavaScript files with ESLint
- `npm run lint:php` - Lint PHP files with WordPress coding standards (requires phpcs)
- `npm run format` - Format JavaScript files with Prettier

### E2E Environment
- Required: `TARGET_URL`, `SQUID_PROXY_USERNAME`, `SQUID_PROXY_PASSWORD`
- Optional: `PROXIES`, `PROXY_TIMEOUT`, `REQUEST_DELAY`, `SAMPLES_PER_PROXY`, `DISTRIBUTION_TOLERANCE`, `MIN_CACHE_SUCCESS_RATE`, `CACHE_SPEEDUP_FACTOR`, `MIN_SECURITY_SUCCESS_RATE`, `ADMIN_CHECK_PATH`

## 🏗️ Architecture

### Core Components

**WordPress Plugin (`plugin/cloudflare-ab-testing.php`)**
- Main plugin file with admin interface
- Handles Cloudflare API integration
- Manages worker deployment and KV namespace operations
- Provides shortcodes for A/B testing display

**Cloudflare Workers (`plugin/workers/`)**
- `ab-testing.js` - Basic A/B testing functionality (production-ready)
- `ab-testing-with-cache.js` - Advanced version with multi-layer caching
- Both workers use KV storage for test configuration

**Frontend JavaScript (`plugin/assets/js/cloudflare-ab-testing.js`)**
- Debug-controlled logging system
- Analytics integration via dataLayer
- Visual debug indicators for admin users

### Test Suite (`tests/`)
- `unit/` – Jest and Miniflare-based unit/integration tests (local)
- `e2e/` – Proxy-based tests against a live `TARGET_URL` (requires Squid proxies)

## 🔍 Hash Algorithm Details

The core variant assignment uses a hash-based algorithm (see worker code for actual implementation).

## 🛡️ Debug System

- PHP: conditional logging based on `WP_DEBUG`
- JavaScript: debug logging gated by admin/debug flags
- Workers: `DEBUG` binding enables extra headers/logging when needed

## 🔄 Common Development Workflows

### 1. Adding New Features
```bash
# 1) Modify code in plugin/
# 2) Sync to WordPress
cp -r plugin/* wordpress/wp-content/plugins/cloudflare-ab-testing/
# 3) Run unit tests and E2E
npm test && npm run test:proxy:all
# 4) Deploy updated worker via WordPress admin
```

### 2. Testing Changes
```bash
# Local (unit/integration)
npm test

# E2E (requires .env with proxy credentials)
npm run test:proxy:all
```

### 3. Debugging Issues
- Enable debug mode in WordPress
- Check browser console for detailed output
- Inspect worker responses for `X-AB-*` headers when `DEBUG` is enabled

## 📁 File Structure

```
cloudflare-ab-testing/
├── plugin/                          # Main plugin files
│   ├── cloudflare-ab-testing.php    # Main plugin file
│   ├── includes/                    # PHP modules
│   ├── assets/js/                   # Frontend JavaScript
│   └── workers/                     # Cloudflare Worker scripts
├── tests/                           # Consolidated test suite
│   ├── unit/                        # Jest + Miniflare tests
│   └── e2e/                         # Proxy-based E2E tests
├── scripts/                         # Build tools
├── wordpress/                       # Local WP install copy
└── README.md                        # Main documentation
```

## 🚨 Critical Development Notes

- Don’t modify WordPress core files; edit under `plugin/` then sync
- Don’t enable debug flags in production
- Always run tests after changes

## 🎯 Validated Status

See `npm run test:all` output for a full pass/fail summary.

## 🔑 Quick Reference

### Test Commands
```bash
npm test
npm run test:proxy:all
npm run test:all
```

### Worker Commands
- Deploy/update via WordPress Admin → A/B Tests → Worker Management
