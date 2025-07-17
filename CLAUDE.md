# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a WordPress plugin for A/B testing using Cloudflare Workers. It provides both full-featured and lightweight worker versions, automated deployment, and comprehensive testing capabilities.

## Development Commands

### Building and Testing
- `npm run build` - Build plugin for distribution using `./scripts/build-plugin.sh`
- `npm test` - Run Jest tests
- `npm run test:watch` - Run Jest tests in watch mode

### Linting and Formatting
- `npm run lint:js` - Lint JavaScript files with ESLint
- `npm run lint:php` - Lint PHP files with WordPress coding standards (requires phpcs)
- `npm run format` - Format JavaScript files with Prettier

### Build Process
The build script (`scripts/build-plugin.sh`) creates a distributable plugin zip by:
- Copying plugin files to build directory
- Cleaning development files
- Creating WordPress readme.txt
- Generating versioned zip file in `releases/` directory

## Architecture

### Core Components

**WordPress Plugin (`plugin/cloudflare-ab-testing.php`)**
- Main plugin file with admin interface
- Handles Cloudflare API integration
- Manages worker deployment and KV namespace operations
- Provides shortcodes for A/B testing display

**Cloudflare Workers (`plugin/workers/`)**
- `ab-simple-worker.js` - Basic A/B testing functionality
- `ab-cache-worker.js` - Advanced version with multi-layer caching
- Both workers use KV storage for test configuration

**Frontend JavaScript (`plugin/assets/js/cloudflare-ab-testing.js`)**
- Admin interface functionality
- AJAX handlers for worker management
- Real-time status monitoring

### Key Features

1. **Worker Management**: Automated deployment of workers to Cloudflare
2. **KV Integration**: Uses Cloudflare KV for storing test configurations
3. **Domain Detection**: Automatically detects correct Cloudflare zone
4. **Caching Strategy**: Multi-layer caching for performance optimization
5. **Debug Tools**: Built-in diagnostics and testing capabilities

### Test Configuration Format

Tests are stored in Cloudflare KV as JSON:
```json
[
  {
    "test": "test_name",
    "paths": ["/", "/home"],
    "cookieName": "AB_TEST_COOKIE"
  }
]
```

### Worker Differences

- **Simple Worker**: Basic A/B testing, lightweight, good for low-traffic sites
- **Cache Worker**: Advanced caching with static asset optimization, production-ready

## File Structure

```
plugin/
├── cloudflare-ab-testing.php    # Main plugin file
├── assets/js/                   # Frontend JavaScript
├── workers/                     # Cloudflare Worker scripts
└── README.md                    # Plugin documentation

tests/
├── unit/                        # PHPUnit tests
└── fixtures/                    # Test data files

scripts/
└── build-plugin.sh             # Build script for distribution
```

## Testing

- Use PHPUnit for PHP unit tests
- Use Jest for JavaScript testing
- Test fixtures available in `tests/fixtures/`
- Plugin functions tested in `tests/unit/test-plugin-functions.php`

## Requirements

- WordPress 5.0+
- PHP 7.4+
- Cloudflare account with Workers and KV enabled
- Valid Cloudflare API token with appropriate permissions