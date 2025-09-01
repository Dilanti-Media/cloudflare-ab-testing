Test structure

- unit/ – Jest unit and Miniflare integration tests (fast, local)
- e2e/ – Proxy-based end-to-end tests against a live TARGET_URL (requires Squid proxies)

Run

- Unit/integration only: npm test
- All tests (unit + e2e): npm run test:all
  - Set PROXY_STRICT=true to require e2e success for overall PASS

E2E env

- TARGET_URL, SQUID_PROXY_USERNAME, SQUID_PROXY_PASSWORD
- Optional: PROXIES, PROXY_TIMEOUT, REQUEST_DELAY, SAMPLES_PER_PROXY, DISTRIBUTION_TOLERANCE, MIN_CACHE_SUCCESS_RATE, CACHE_SPEEDUP_FACTOR, MIN_SECURITY_SUCCESS_RATE, ADMIN_CHECK_PATH

Notes

- Proxy GA4 test skips if TARGET_URL or credentials are missing.
- Security test uses ADMIN_CHECK_PATH (default /wp-json/) as a public bypass; admin-only endpoints may block proxies.

