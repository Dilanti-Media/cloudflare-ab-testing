const http = require('http');
const path = require('path');
const { Miniflare } = require('miniflare');

// Simple origin that doesn't interfere with caching
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
      res.writeHead(200, { 'Content-Type': 'text/html', 'X-Origin-Req': String(counter) });
      res.end('<html><body>ok</body></html>');
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

jest.setTimeout(30000);

describe('A/B variant assignment ~50/50', () => {
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
      { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/ab'] }
    ]));
  });

  afterAll(async () => {
    if (origin?.server) origin.server.close();
    if (mf) await mf.dispose();
  });

  test('variant distribution across varying IPs is roughly balanced', async () => {
    const urlBase = `http://127.0.0.1:${origin.port}/ab/page`;
    let a = 0; let b = 0; const total = 200;

    for (let i = 0; i < total; i++) {
      const ip = `192.168.1.${i % 250}`;
      const res = await mf.dispatchFetch(urlBase, { headers: { 'CF-Connecting-IP': ip, 'User-Agent': `testbot/${i}` } });
      const v = res.headers.get('x-ab-variant');
      if (v === 'A') a++; else if (v === 'B') b++; else throw new Error('Missing variant');
    }

    const aPct = (a / total) * 100;
    const bPct = (b / total) * 100;

    // Expect near 50/50 with generous tolerance, since mapping uses SHA-256 first byte
    expect(a + b).toBe(total);
    expect(aPct).toBeGreaterThan(30);
    expect(bPct).toBeGreaterThan(30);
    expect(Math.abs(aPct - bPct)).toBeLessThan(40); // within 40% spread at worst
  });
});

