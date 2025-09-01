const fs = require('fs');
const path = require('path');

describe('Cache worker parity and safety checks', () => {
  const cacheWorkerPath = path.join(__dirname, '../../plugin/workers/ab-testing-with-cache.js');
  const baselineWorkerPath = path.join(__dirname, '../../plugin/workers/ab-testing.js');

  let cacheContent;
  let baselineContent;

  beforeAll(() => {
    cacheContent = fs.readFileSync(cacheWorkerPath, 'utf8');
    baselineContent = fs.readFileSync(baselineWorkerPath, 'utf8');
  });

  test('has request and response variant headers', () => {
    expect(cacheContent).toContain("headers.set('X-AB-Variant', variant)");
    expect(cacheContent).toMatch(/X-AB-Test/);
    expect(cacheContent).toMatch(/X-Worker-Active/);
  });

  test('sets secure cookie flags', () => {
    expect(cacheContent).toMatch(/Set-Cookie/);
    expect(cacheContent).toMatch(/HttpOnly/);
    expect(cacheContent).toMatch(/SameSite=Lax/);
    expect(cacheContent).toMatch(/Secure/);
  });

  test('ensures Vary includes Cookie via mergeVary', () => {
    expect(cacheContent).toMatch(/mergeVary\(headers\.get\('Vary'\), \['Cookie'\]\)/);
  });

  test('has KV timeout and registry cache key v1', () => {
    expect(cacheContent).toMatch(/KV_TIMEOUT_MS\s*:\s*5000/);
    expect(cacheContent).toMatch(/ab-registry-cache-v1/);
  });

  test('has WordPress bypasses and personalization checks', () => {
    expect(cacheContent).toMatch(/wordpress_logged_in_/);
    expect(cacheContent).toMatch(/preview/);
    expect(cacheContent).toMatch(/BYPASS_PATHS/);
    // Methods whitelist for cache-only
    expect(cacheContent).toMatch(/CACHE_ONLY_METHODS/);
  });

  test('has circuit breaker and KV availability check', () => {
    expect(cacheContent).toMatch(/KV_FAILURE_THRESHOLD/);
    expect(cacheContent).toMatch(/checkKVNamespace\(/);
  });

  test('uses WebCrypto hashing for variant generation', () => {
    expect(cacheContent).toMatch(/crypto\.subtle\.digest\(/);
  });

  test('includes debug server-side header when DEBUG enabled', () => {
    expect(cacheContent).toMatch(/X-AB-Debug-Server-Side/);
  });

  test('baseline still contains core header logic for comparison', () => {
    expect(baselineContent).toContain("headers.set('X-AB-Variant', variant)");
    expect(baselineContent).toMatch(/X-AB-Test/);
  });
});
