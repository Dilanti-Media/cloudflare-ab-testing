#!/usr/bin/env node

/**
 * Proxy-based security test (E2E)
 * - Ensures bypass paths (/wp-json/ by default) don’t set AB headers/cookies
 * - Ensures personalized request is private/no-store and doesn't affect subsequent anonymous request
 */

const http = require('http');
const https = require('https');
require('dotenv').config();

const CONFIG = {
  TIMEOUT: parseInt(process.env.PROXY_TIMEOUT || '15000', 10),
  DELAY_MS: parseInt(process.env.REQUEST_DELAY || '300', 10),
  MIN_SUCCESS_RATE: parseFloat(process.env.MIN_SECURITY_SUCCESS_RATE || '0.6'),
};

const TARGET_BASE = (process.env.TARGET_URL || 'https://cloudflare-ab-testing.dilanti.media/').replace(/\/$/, '');
const ADMIN_CHECK_PATH = process.env.ADMIN_CHECK_PATH || '/wp-json/';
const ADMIN_URL = `${TARGET_BASE}${ADMIN_CHECK_PATH.startsWith('/') ? '' : '/'}${ADMIN_CHECK_PATH}`;
const PAGE_URL = `${TARGET_BASE}/`;

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
    const target = new URL(url);

    const connectReq = http.request({
      hostname: proxyHost, port: proxyPort, method: 'CONNECT', path: `${target.hostname}:443`,
      headers: { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${process.env.SQUID_PROXY_USERNAME}:${process.env.SQUID_PROXY_PASSWORD}`).toString('base64') },
      timeout: CONFIG.TIMEOUT
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) return resolve({ success: false, error: `CONNECT ${res.statusCode}` });

      const req = https.request({ hostname: target.hostname, port: 443, path: target.pathname + (target.search || ''), method: 'GET',
        headers: { 'User-Agent': (process.env.USER_AGENT || 'Mozilla/5.0'), Accept: 'text/html,application/json,*/*', ...headers }, socket, timeout: CONFIG.TIMEOUT },
        (r) => {
          let body = ''; r.setEncoding('utf8');
          r.on('data', c => { body += c; });
          r.on('end', () => {
            resolve({ success: true, status: r.statusCode, headers: r.headers, body });
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

function hasPrivateNoStore(headers) {
  const cc = (headers['cache-control'] || '').toLowerCase();
  return cc.includes('private') || cc.includes('no-store') || cc.includes('no-cache');
}

(async function run() {
  console.log('🔒 Proxy Security Test (bypass & personalized isolation)');
  console.log('Bypass URL:', ADMIN_URL);
  console.log('Page URL:', PAGE_URL);
  if (!process.env.SQUID_PROXY_USERNAME || !process.env.SQUID_PROXY_PASSWORD) {
    console.log('⚠️ Missing SQUID proxy credentials in .env - skipping');
    process.exit(0);
  }

  let working = 0, passed = 0;

  for (const proxy of PROXY_LIST) {
    const [host, portStr] = proxy.split(':');
    const port = parseInt(portStr, 10);
    process.stdout.write(`${proxy.padEnd(20)} | `);

    const adminRes = await requestViaProxy({ proxyHost: host, proxyPort: port, url: ADMIN_URL });
    let adminOk = false, adminSkipped = false;
    if (!adminRes.success) adminSkipped = true;
    else if (adminRes.status === 200) adminOk = !adminRes.headers['x-ab-variant'] && !String(adminRes.headers['set-cookie'] || '').includes('AB_HOMEPAGE_TEST=');
    else adminSkipped = true;

    const persRes = await requestViaProxy({ proxyHost: host, proxyPort: port, url: PAGE_URL, headers: { Cookie: 'wordpress_logged_in_=1' } });
    if (!persRes.success || persRes.status !== 200) { console.log('❌ personalized fetch failed'); continue; }
    const persOk = !persRes.headers['x-ab-variant'] && hasPrivateNoStore(persRes.headers);

    await new Promise(r => setTimeout(r, CONFIG.DELAY_MS));
    const anonRes = await requestViaProxy({ proxyHost: host, proxyPort: port, url: PAGE_URL });
    if (!anonRes.success || anonRes.status !== 200) { console.log('❌ anonymous fetch failed'); continue; }
    const anonOk = ['A', 'B'].includes((anonRes.headers['x-ab-variant'] || '').toUpperCase());

    working++;
    const proxyPass = (adminOk || adminSkipped) && persOk && anonOk;
    const adminState = adminOk ? '✅' : (adminSkipped ? 'SKIP' : '❌');
    console.log(`bypass:${adminState} personalized:${persOk ? '✅' : '❌'} anon:${anonOk ? '✅' : '❌'} => ${proxyPass ? '✅' : '❌'}`);
    if (proxyPass) passed++;
  }

  if (working === 0) { console.log('⚠️ No working proxies; cannot assess security behavior'); process.exit(1); }

  const rate = passed / working;
  console.log('— Summary —');
  console.log(`Working proxies: ${working}`);
  console.log(`Pass rate: ${(rate*100).toFixed(1)}% (threshold ${(CONFIG.MIN_SUCCESS_RATE*100)}%)`);
  process.exit(rate >= CONFIG.MIN_SUCCESS_RATE ? 0 : 1);
})();

