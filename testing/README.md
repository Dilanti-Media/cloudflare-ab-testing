# A/B Testing System Verification

This directory contains the comprehensive test suite for validating the Cloudflare A/B testing system.

## Available Tests

### test-ga4.js – GA4 Detection and Analytics Testing

- Headless Chrome to detect standard GA4 and custom/proxy endpoints
- Multi-proxy testing, diagnostics when no hits are detected

**Usage:**

```bash
# Requires puppeteer and proxy credentials
npm install puppeteer
node test-ga4.js

# Environment variables:
TARGET_URL=https://your-site-with-ab-tests.com  # Default: test site
MAX_CONCURRENT=3                                # Concurrent proxy tests
TIMEOUT=60000                                  # Request timeout in ms
WAIT_TIME=10000                                # Time to wait for analytics to fire
LOG_DETAILED_HITS=true                         # Show detailed hit information
```

### test-ab-complete.js – Complete System Verification

- Algorithm distribution (10k samples)
- Live system check via proxies (header/meta/content sync)

**Usage:**

```bash
# Run complete test suite (includes both algorithm and live testing)
node test-ab-complete.js

# The script automatically detects proxy credentials:
# - If .env file with proxy credentials exists: runs algorithm + live testing
# - If no proxy credentials: runs algorithm testing only and skips live testing
```

**Requirements:**
- Node.js 16+ 
- For live testing: `.env` file with `SQUID_PROXY_USERNAME` and `SQUID_PROXY_PASSWORD`

### test-cache-worker.js – Cache Worker Feature Check

- Verifies presence of critical cache worker features:
  - X-AB-Variant request header
  - WordPress bypasses
  - Proper timeouts and KV timeout
  - Cache API no-test path caching and v1 registry key
  - POST bypass

**Usage:**

```bash
node test-cache-worker.js
```

### Jest unit and integration tests (Miniflare)

- Parity checks for headers/cookies and config flags
- Miniflare integration tests cover:
  - Variant assignment and cookies
  - Admin/static/POST/preview/logged-in/large-cookie bypasses
  - URL param forced variant
  - Debug headers (env.DEBUG)
  - Cache API no-test path persistence across registry updates

**Run all Jest tests:**

```bash
npm test
```

## Environment Setup

```bash
# Install Node.js dependencies (if any)
npm install

# Set up environment variables for live testing
cp .env.example .env
# Edit .env with your proxy credentials
```

## Troubleshooting

- If GA4 hits are sporadic, that’s normal; the suite accepts successful hits across proxies
- Ensure the worker is deployed and KV bound (AB_TESTS_KV) if registry is used
