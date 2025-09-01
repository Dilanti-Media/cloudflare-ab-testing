const http = require('http');
const path = require('path');
const { Miniflare } = require('miniflare');

async function startOrigin() {
  return await new Promise((resolve) => {
    let counter = 0;
    const server = http.createServer((req, res) => {
      counter += 1;
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.endsWith('.css')) {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('body{color:black;}');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'X-Origin-Counter': String(counter),
        'Cache-Control': 'public, max-age=60'
      });
      res.end(`<html><body>req:${counter}</body></html>`);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

jest.setTimeout(30000);

describe('Variant cache hit/miss behavior', () => {
  let origin; let mf;

  beforeAll(async () => {
    origin = await startOrigin();
    mf = new Miniflare({
      modules: true,
      scriptPath: path.join(__dirname, '../../plugin/workers/ab-testing-with-cache.js'),
      kvNamespaces: ['AB_TESTS_KV'],
      bindings: { DEBUG: false },
      unsafeNetwork: true
    });
    const kv = await mf.getKVNamespace('AB_TESTS_KV');
    await kv.put('registry', JSON.stringify([
      { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/cache'] }
    ]));
  });

  afterAll(async () => {
    if (origin?.server) origin.server.close();
    if (mf) await mf.dispose();
  });

  test('first request is miss, second is hit for same variant', async () => {
    const url = `http://127.0.0.1:${origin.port}/cache/page`;
    const headers = { 'CF-Connecting-IP': '10.0.0.1', 'User-Agent': 'cachebot/1' };

    const r1 = await mf.dispatchFetch(url, { headers });
    const b1 = await r1.text();
    expect(r1.headers.get('x-variant-cache')).toBe('miss');
    const variant = r1.headers.get('x-ab-variant');
    expect(['A', 'B']).toContain(variant);

    const r2 = await mf.dispatchFetch(url, { headers });
    const b2 = await r2.text();
    expect(r2.headers.get('x-variant-cache')).toBe('hit');
    expect(r2.headers.get('x-ab-variant')).toBe(variant);
    expect(b2).toBe(b1); // served from cache
  });

  test('different variant yields independent cache entries', async () => {
    const url = `http://127.0.0.1:${origin.port}/cache/page2`;

    // Force A via URL param
    const rA = await mf.dispatchFetch(`${url}?AB_HOMEPAGE_TEST=A`);
    const bodyA1 = await rA.text();
    expect(rA.headers.get('x-ab-variant')).toBe('A');

    // Force B via URL param (same normalized key still variant-split)
    const rB = await mf.dispatchFetch(`${url}?AB_HOMEPAGE_TEST=B`);
    const bodyB1 = await rB.text();
    expect(rB.headers.get('x-ab-variant')).toBe('B');

    // Re-fetch A to ensure it hits A bucket and body equals first A body
    const rA2 = await mf.dispatchFetch(`${url}?AB_HOMEPAGE_TEST=A`);
    const bodyA2 = await rA2.text();
    expect(rA2.headers.get('x-variant-cache')).toBe('hit');
    expect(bodyA2).toBe(bodyA1);

    // Re-fetch B likewise
    const rB2 = await mf.dispatchFetch(`${url}?AB_HOMEPAGE_TEST=B`);
    const bodyB2 = await rB2.text();
    expect(rB2.headers.get('x-variant-cache')).toBe('hit');
    expect(bodyB2).toBe(bodyB1);
  });
});

