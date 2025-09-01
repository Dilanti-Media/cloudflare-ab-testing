const http = require('http');
const path = require('path');
const { Miniflare } = require('miniflare');

async function startOrigin() {
  return await new Promise((resolve) => {
    let counter = 0;
    const server = http.createServer((req, res) => {
      counter += 1;
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname.startsWith('/wp-admin/')) {
        // Simulate admin page; origin could send cacheable headers but worker must protect
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'X-Origin-Counter': String(counter),
          'Cache-Control': 'public, max-age=600'
        });
        res.end('<html><body>admin</body></html>');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/html',
        'X-Origin-Counter': String(counter),
        'Cache-Control': 'public, max-age=120'
      });
      res.end(`<html><body>req:${counter}</body></html>`);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

jest.setTimeout(30000);

describe('Security: admin/personalized isolation from cache', () => {
  let origin; let mf;

  beforeAll(async () => {
    origin = await startOrigin();
    mf = new Miniflare({
      modules: true,
      scriptPath: path.join(__dirname, '../../plugin/workers/ab-testing-with-cache.js'),
      kvNamespaces: ['AB_TESTS_KV'],
      bindings: { DEBUG: true },
      unsafeNetwork: true
    });
    const kv = await mf.getKVNamespace('AB_TESTS_KV');
    await kv.put('registry', JSON.stringify([
      { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/secure'] }
    ]));
  });

  afterAll(async () => {
    if (origin?.server) origin.server.close();
    if (mf) await mf.dispose();
  });

  test('wp-admin bypass has no AB headers/cookies', async () => {
    const adminUrl = `http://127.0.0.1:${origin.port}/wp-admin/`;
    const res = await mf.dispatchFetch(adminUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ab-variant')).toBeNull();
    expect(res.headers.get('x-ab-test')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('personalized request is non-cacheable and isolated', async () => {
    const url = `http://127.0.0.1:${origin.port}/secure/page`;

    // Personalized due to WP cookie
    const p = await mf.dispatchFetch(url, { headers: { Cookie: 'wordpress_logged_in_=1' } });
    const pBody = await p.text();
    expect(p.headers.get('x-ab-variant')).toBeNull();
    expect(p.headers.get('set-cookie')).toBeNull();

    const cc = p.headers.get('cache-control') || '';
    expect(/private|no-store|no-cache/i.test(cc)).toBe(true);
    const vary = p.headers.get('vary') || '';
    expect(vary.toLowerCase()).toContain('cookie');

    // Follow-up anonymous request should apply AB logic and not reuse personalized response
    const a1 = await mf.dispatchFetch(url);
    const a1Body = await a1.text();
    const variant = a1.headers.get('x-ab-variant');
    expect(['A', 'B']).toContain(variant);
    expect(a1.headers.get('x-variant-cache')).toBe('miss');
    expect(a1Body).not.toBe(pBody);

    // Next anonymous request should hit cache for this variant
    const a2 = await mf.dispatchFetch(url);
    expect(a2.headers.get('x-variant-cache')).toBe('hit');
  });
});

