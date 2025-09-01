#!/usr/bin/env node

/**
 * Proxy-based cache hit/miss verification (E2E)
 */

const http = require('http');
const https = require('https');
require('dotenv').config();
const { performance } = require('perf_hooks');

const CONFIG = {
  TIMEOUT: parseInt(process.env.PROXY_TIMEOUT || '15000', 10),
  DELAY_MS: parseInt(process.env.REQUEST_DELAY || '300', 10),
  MIN_SUCCESS_RATE: parseFloat(process.env.MIN_CACHE_SUCCESS_RATE || '0.3'),
  SPEEDUP_FACTOR: parseFloat(process.env.CACHE_SPEEDUP_FACTOR || '1.2')
};

const TARGET_BASE = (process.env.TARGET_URL || 'https://cloudflare-ab-testing.dilanti.media/').replace(/\/$/, '');

const PROXIES = (process.env.PROXIES || '').split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_PROXIES = [
  '23.19.98.55:8800','23.19.98.180:8800','173.234.232.213:8800','23.19.98.82:8800','23.19.98.57:8800',
  '173.234.232.82:8800','173.232.127.234:8800','173.234.194.122:8800','173.234.194.169:8800','173.232.127.166:8800'
];
const PROXY_LIST = PROXIES.length ? PROXIES : DEFAULT_PROXIES;

function requestViaProxy({ proxyHost, proxyPort, url, headers = {} }) {
  return new Promise((resolve) => {
    if (!process.env.SQUID_PROXY_USERNAME || !process.env.SQUID_PROXY_PASSWORD) {
      resolve({ success: false, error: 'Missing proxy credentials' });
      return;
    }
    const { hostname, pathname, search } = new URL(url);

    const connectReq = http.request({
      hostname: proxyHost, port: proxyPort, method: 'CONNECT', path: `${hostname}:443`,
      headers: { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${process.env.SQUID_PROXY_USERNAME}:${process.env.SQUID_PROXY_PASSWORD}`).toString('base64') },
      timeout: CONFIG.TIMEOUT
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) return resolve({ success: false, error: `CONNECT ${res.statusCode}` });

      const start = performance.now();
      const req = https.request({ hostname, port: 443, path: pathname + (search || ''), method: 'GET',
        headers: { 'User-Agent': (process.env.USER_AGENT || 'Mozilla/5.0'), Accept: 'text/html', ...headers }, socket, timeout: CONFIG.TIMEOUT },
        (r) => {
          let body = ''; r.setEncoding('utf8');
          r.on('data', c => { body += c; });
          r.on('end', () => {
            const dur = performance.now() - start;
            resolve({ success: true, status: r.statusCode, timeMs: dur, headers: r.headers, body });
          });
        });
      req.on('error', () => resolve({ success: false, error: 'HTTPS error' }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'HTTPS timeout' }); });
      req.end();
    });

    connectReq.on('error', () => resolve({ success: false, error: 'CONNECT error' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ success: false, error: 'CONNECT timeout' }); });
    connectReq.end();
  });
}

(async function run() {
  console.log('🧪 Proxy Cache Hit/Miss Test');
  if (!process.env.SQUID_PROXY_USERNAME || !process.env.SQUID_PROXY_PASSWORD) {
    console.log('⚠️ Missing SQUID proxy credentials in .env - skipping');
    process.exit(0);
  }

  let working = 0, passed = 0;

  for (let index = 0; index < PROXY_LIST.length; index++) {
    const proxy = PROXY_LIST[index];
    const [host, portStr] = proxy.split(':');
    const port = parseInt(portStr, 10);
    const url = `${TARGET_BASE}/?AB_HOMEPAGE_TEST=A&cb=${index}`;
    process.stdout.write(`${proxy.padEnd(20)} | `);

    const r1 = await requestViaProxy({ proxyHost: host, proxyPort: port, url });
    if (!r1.success || r1.status !== 200) { console.log('❌ first request failed'); continue; }
    await new Promise(r => setTimeout(r, CONFIG.DELAY_MS));
    const r2 = await requestViaProxy({ proxyHost: host, proxyPort: port, url });
    if (!r2.success || r2.status !== 200) { console.log('❌ second request failed'); continue; }

    working++;
    const c1 = (r1.headers['x-variant-cache'] || '').toLowerCase();
    const c2 = (r2.headers['x-variant-cache'] || '').toLowerCase();

    let pass = false;
    // Accept if second request is served from cache, regardless of first (edge may already be warm)
    if (c2 === 'hit') pass = true;
    // Or accept timing-based speedup as a proxy signal
    else if (r2.timeMs * CONFIG.SPEEDUP_FACTOR < r1.timeMs) pass = true;

    console.log(`miss/hit: ${c1 || '-'} -> ${c2 || '-'} | ${Math.round(r1.timeMs)}ms -> ${Math.round(r2.timeMs)}ms | ${pass ? '✅' : '❌'}`);
    if (pass) passed++;
  }

  if (working === 0) {
    console.log('⚠️ No working proxies; cannot assess cache behavior');
    process.exit(1);
  }

  const rate = passed / working;
  console.log('— Summary —');
  console.log(`Working proxies: ${working}`);
  console.log(`Pass rate: ${(rate*100).toFixed(1)}% (threshold ${(CONFIG.MIN_SUCCESS_RATE*100)}%)`);
  process.exit(rate >= CONFIG.MIN_SUCCESS_RATE ? 0 : 1);
})();
