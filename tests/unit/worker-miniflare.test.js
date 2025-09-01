const http = require('http');
const { Miniflare } = require('miniflare');

// Helper to start a simple origin server that echoes variant headers
async function startOriginServer() {
  return await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const variant = req.headers['x-ab-variant'] || 'None';
      const abTest = req.headers['x-ab-test'] || 'HOME';

      // Simulate static asset
      if (url.pathname.endsWith('.css')) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('body{color:black;}');
        return;
      }

      // Simulate admin path
      if (url.pathname.startsWith('/wp-admin/')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Admin</body></html>');
        return;
      }

      const html = `<!doctype html><html><head>
        <meta name="cf-ab-variant" content="${variant === 'None' ? 'Unknown' : variant}">
        <meta name="cf-ab-test" content="${abTest}">
        </head><body>
        <h1>Variant: ${variant}</h1>
        </body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

// Parse Set-Cookie header for a name=value pair
function parseCookie(setCookie, name) {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const regex = new RegExp(`${name}=([A-Za-z0-9_\-]+)`);
  for (const line of arr) {
    const match = line.match(regex);
    if (match) return match[1];
  }
  return null;
}

// Extract meta variant from HTML
function extractMetaVariant(html) {
  const m = html.match(/<meta name=\"cf-ab-variant\" content=\"([A-Za-z]+)\"/);
  return m ? m[1] : 'Unknown';
}

jest.setTimeout(30000);

describe('Miniflare integration: ab-testing-with-cache', () => {
  let origin;
  let mf;

  beforeAll(async () => {
    origin = await startOriginServer();

    mf = new Miniflare({
      modules: true,
      scriptPath: require('path').join(__dirname, '../../plugin/workers/ab-testing-with-cache.js'),
      kvNamespaces: ['AB_TESTS_KV'],
      bindings: {
        DEBUG: false
      },
      // Allow network access to our local origin server
      unsafeNetwork: true
    });

    // Seed KV registry
    const kv = await mf.getKVNamespace('AB_TESTS_KV');
    await kv.put('registry', JSON.stringify([
      { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/'] }
    ]));
  });

  afterAll(async () => {
    if (origin?.server) origin.server.close();
    if (mf) await mf.dispose();
  });

  test('assigns variant, forwards header, sets cookie', async () => {
    const url = `http://127.0.0.1:${origin.port}/`;
    const res = await mf.dispatchFetch(url);
    const text = await res.text();

    expect(res.status).toBe(200);
    // Worker-added headers
    expect(res.headers.get('x-ab-test')).toBe('HOME');
    const variant = res.headers.get('x-ab-variant');
    expect(['A', 'B']).toContain(variant);
    // Cookie set
    const setCookie = res.headers.get('set-cookie');
    const cookieVal = parseCookie(setCookie, 'AB_HOMEPAGE_TEST');
    expect(cookieVal).toBe(variant);
    // Origin saw variant via header and reflected in meta
    expect(extractMetaVariant(text)).toBe(variant);
  });

  test('respects existing cookie on subsequent request', async () => {
    const url = `http://127.0.0.1:${origin.port}/`;
    // First request to get cookie
    const first = await mf.dispatchFetch(url);
    const cookie = first.headers.get('set-cookie');
    const variant = parseCookie(cookie, 'AB_HOMEPAGE_TEST');
    expect(['A', 'B']).toContain(variant);

    // Second request sends cookie back
    const res = await mf.dispatchFetch(url, {
      headers: { Cookie: `AB_HOMEPAGE_TEST=${variant}` }
    });
    const body = await res.text();
    expect(res.headers.get('x-ab-variant')).toBe(variant);
    expect(extractMetaVariant(body)).toBe(variant);
  });

  test('bypasses admin path and static file', async () => {
    const adminUrl = `http://127.0.0.1:${origin.port}/wp-admin/`;
    const cssUrl = `http://127.0.0.1:${origin.port}/style.css`;

    const adminRes = await mf.dispatchFetch(adminUrl);
    expect(adminRes.status).toBe(200);
    expect(adminRes.headers.get('x-ab-variant')).toBeNull();
    expect(adminRes.headers.get('set-cookie')).toBeNull();

    const cssRes = await mf.dispatchFetch(cssUrl);
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get('content-type')).toMatch(/text\/css/);
    expect(cssRes.headers.get('x-ab-variant')).toBeNull();
  });

  test('URL param forces variant', async () => {
    const url = `http://127.0.0.1:${origin.port}/?AB_HOMEPAGE_TEST=A`;
    const res = await mf.dispatchFetch(url);
    const body = await res.text();
    expect(res.headers.get('x-ab-variant')).toBe('A');
    expect(parseCookie(res.headers.get('set-cookie'), 'AB_HOMEPAGE_TEST')).toBe('A');
    expect(extractMetaVariant(body)).toBe('A');
  });

  test('bypasses on POST method', async () => {
    const url = `http://127.0.0.1:${origin.port}/`;
    const res = await mf.dispatchFetch(url, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ab-variant')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('bypasses when Cookie header is very large', async () => {
    const url = `http://127.0.0.1:${origin.port}/`;
    const bigCookie = 'x='.repeat(9000); // ~18000 chars
    const res = await mf.dispatchFetch(url, { headers: { Cookie: bigCookie } });
    // Depending on underlying HTTP stack, origin may reject with 431 before worker adds headers
    expect([200, 431]).toContain(res.status);
    expect(res.headers.get('x-ab-variant')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('bypasses when wordpress_logged_in_ cookie present', async () => {
    const url = `http://127.0.0.1:${origin.port}/`;
    const res = await mf.dispatchFetch(url, { headers: { Cookie: 'wordpress_logged_in_=1' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ab-variant')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('bypasses when preview query param present', async () => {
    const url = `http://127.0.0.1:${origin.port}/?preview=1`;
    const res = await mf.dispatchFetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ab-variant')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('emits debug server-side header when DEBUG is true', async () => {
    const mfDebug = new Miniflare({
      modules: true,
      scriptPath: require('path').join(__dirname, '../../plugin/workers/ab-testing-with-cache.js'),
      kvNamespaces: ['AB_TESTS_KV'],
      bindings: { DEBUG: true },
      unsafeNetwork: true
    });
    const kv = await mfDebug.getKVNamespace('AB_TESTS_KV');
    await kv.put('registry', JSON.stringify([
      { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/'] }
    ]));

    const url = `http://127.0.0.1:${origin.port}/`;
    const res = await mfDebug.dispatchFetch(url);
    expect(res.headers.get('x-ab-debug-server-side')).toBe('true');

    await mfDebug.dispose();
  });

  test('caches no-test path and continues bypass after registry update', async () => {
    // Use an isolated Miniflare instance with a registry that does NOT match '/no-test/' initially
    const mfIso = new Miniflare({
      modules: true,
      scriptPath: require('path').join(__dirname, '../../plugin/workers/ab-testing-with-cache.js'),
      kvNamespaces: ['AB_TESTS_KV'],
      bindings: { DEBUG: false },
      unsafeNetwork: true
    });
    const kvIso = await mfIso.getKVNamespace('AB_TESTS_KV');
    await kvIso.put('registry', JSON.stringify([
      { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/abtest/'] }
    ]));

    const noMatchPath = '/no-test/';
    const url1 = `http://127.0.0.1:${origin.port}${noMatchPath}`;

    // First request: no test matches, should bypass and cache no-test in Cache API
    const res1 = await mfIso.dispatchFetch(url1);
    expect([200, 204]).toContain(res1.status);
    expect(res1.headers.get('x-ab-variant')).toBeNull();

    // Update KV registry to include this path now
    await kvIso.put('registry', JSON.stringify([
      { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/abtest/','/no-test/'] }
    ]));

    // Second request to same path shortly after: should still bypass due to no-test Cache API entry
    const res2 = await mfIso.dispatchFetch(url1);
    expect([200, 204]).toContain(res2.status);
    expect(res2.headers.get('x-ab-variant')).toBeNull();

    await mfIso.dispose();
  });
});
