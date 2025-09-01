#!/usr/bin/env node

/**
 * Proxy-based A/B split verification (E2E)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG = {
  DISTRIBUTION_TOLERANCE: parseFloat(process.env.DISTRIBUTION_TOLERANCE || '0.2'),
  TIMEOUT: parseInt(process.env.PROXY_TIMEOUT || '15000', 10),
  SAMPLES_PER_PROXY: parseInt(process.env.SAMPLES_PER_PROXY || '5', 10),
  DELAY_MS: parseInt(process.env.REQUEST_DELAY || '150', 10)
};

const TARGET_URL = (process.env.TARGET_URL || 'https://cloudflare-ab-testing.dilanti.media/').replace(/\/$/, '') + '/';

const PROXIES = (process.env.PROXIES || '').split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_PROXIES = [
  '23.19.98.55:8800','23.19.98.180:8800','173.234.232.213:8800','23.19.98.82:8800','23.19.98.57:8800',
  '173.234.232.82:8800','173.232.127.234:8800','173.234.194.122:8800','173.234.194.169:8800','173.232.127.166:8800'
];
const PROXY_LIST = PROXIES.length ? PROXIES : DEFAULT_PROXIES;

function extractMetaVariant(html) {
  const m = html.match(/<meta name=\"cf-ab-variant\" content=\"([AB])\"/);
  return m ? m[1] : 'Unknown';
}

function extractContentVariant(html) {
  const hasA = html.includes('btn-ab btn-a') && html.includes('Click Here');
  const hasB = html.includes('btn-ab btn-b') && html.includes('Click Here');
  if (hasA && !hasB) return 'A';
  if (hasB && !hasA) return 'B';
  if (!hasA && !hasB) return 'None';
  return 'Both';
}

async function fetchViaProxy(proxyHost, proxyPort, target, ua) {
  return await new Promise((resolve) => {
    if (!process.env.SQUID_PROXY_USERNAME || !process.env.SQUID_PROXY_PASSWORD) {
      resolve({ success: false, error: 'Missing proxy credentials' });
      return;
    }
    const { hostname, pathname, search } = new URL(target);
    const connectReq = http.request({
      hostname: proxyHost, port: proxyPort, method: 'CONNECT', path: `${hostname}:443`,
      headers: { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${process.env.SQUID_PROXY_USERNAME}:${process.env.SQUID_PROXY_PASSWORD}`).toString('base64') },
      timeout: CONFIG.TIMEOUT
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) return resolve({ success: false, error: `CONNECT ${res.statusCode}` });
      const req = https.request({ hostname, port: 443, path: pathname + (search || ''), method: 'GET',
        headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, socket, timeout: CONFIG.TIMEOUT },
        (r) => {
          let body = ''; r.setEncoding('utf8');
          r.on('data', c => { body += c; });
          r.on('end', () => {
            const headerVariant = r.headers['x-ab-variant'] || 'Unknown';
            resolve({ success: true, status: r.statusCode, headerVariant, metaVariant: extractMetaVariant(body), contentVariant: extractContentVariant(body) });
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
  console.log('🔀 Proxy A/B Split Test');
  console.log('Target:', TARGET_URL);
  if (!process.env.SQUID_PROXY_USERNAME || !process.env.SQUID_PROXY_PASSWORD) {
    console.log('⚠️ Missing SQUID proxy credentials in .env - skipping');
    process.exit(0);
  }

  let headerA = 0, headerB = 0; let ok = 0;
  for (let p = 0; p < PROXY_LIST.length; p++) {
    const proxy = PROXY_LIST[p];
    const [host, portStr] = proxy.split(':');
    const port = parseInt(portStr, 10);
    process.stdout.write(`${proxy.padEnd(20)} | `);
    let localA = 0, localB = 0, localOk = 0;
    for (let i = 0; i < CONFIG.SAMPLES_PER_PROXY; i++) {
      const ua = `Mozilla/5.0 (Proxy ${p}) TestBot/${i}.${Date.now()%100000}`;
      const res = await fetchViaProxy(host, port, TARGET_URL + `?cb=${p}-${i}`, ua);
      if (res.success && res.status === 200) {
        localOk++;
        if (res.headerVariant === 'A') { headerA++; localA++; }
        else if (res.headerVariant === 'B') { headerB++; localB++; }
      }
      await new Promise(r => setTimeout(r, CONFIG.DELAY_MS));
    }
    ok += localOk;
    console.log(`H:A ${localA} B ${localB} (${localOk}/${CONFIG.SAMPLES_PER_PROXY})`);
  }

  const total = headerA + headerB;
  if (total === 0) { console.log('⚠️ No successful responses; cannot evaluate split.'); process.exit(1); }
  const headerAPct = headerA / total;
  const headerBPct = headerB / total;
  console.log('— Summary —');
  console.log(`Samples OK: ${ok}/${PROXY_LIST.length * CONFIG.SAMPLES_PER_PROXY}`);
  console.log(`Header Split: A ${Math.round(headerAPct*100)}% | B ${Math.round(headerBPct*100)}%`);
  const balanced = Math.abs(0.5 - headerAPct) <= CONFIG.DISTRIBUTION_TOLERANCE;
  console.log(`Balance within tolerance (${CONFIG.DISTRIBUTION_TOLERANCE*100}%): ${balanced ? '✅' : '❌'}`);
  process.exit(balanced ? 0 : 1);
})();

