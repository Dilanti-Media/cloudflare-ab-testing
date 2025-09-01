#!/usr/bin/env node

// GA4 E2E proxy test (optional; skips if env is missing)
require('dotenv').config();
const puppeteer = require('puppeteer');

const SQUID_PROXY_USERNAME_ENV = 'SQUID_PROXY_USERNAME';
const SQUID_PROXY_PASSWORD_ENV = 'SQUID_PROXY_PASSWORD';

if (!process.env.TARGET_URL) {
  console.log('⚠️ GA4 test skipped: missing TARGET_URL');
  process.exit(0);
}
if (!process.env[SQUID_PROXY_USERNAME_ENV] || !process.env[SQUID_PROXY_PASSWORD_ENV]) {
  console.log('⚠️ GA4 test skipped: missing Squid proxy credentials');
  process.exit(0);
}

const PROXIES = [
  '23.19.98.55:8800','23.19.98.180:8800','173.234.232.213:8800','23.19.98.82:8800','23.19.98.57:8800',
  '173.234.232.82:8800','173.232.127.234:8800','173.234.194.122:8800','173.234.194.169:8800','173.232.127.166:8800'
];

const TARGET_URL = process.env.TARGET_URL;

const CONFIG = {
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT) || 3,
  timeout: parseInt(process.env.TIMEOUT) || 60000,
  waitTime: parseInt(process.env.WAIT_TIME) || 10000,
  retryFailedProxies: process.env.RETRY_FAILED === 'true',
  logDetailedHits: process.env.LOG_DETAILED_HITS === 'true',
  logDiagnostics: process.env.LOG_DIAGNOSTICS !== 'false'
};

async function testProxy(proxy, retryCount = 0) {
  let browser;
  const startTime = Date.now();
  try {
    browser = await puppeteer.launch({ headless: true, args: [`--proxy-server=${proxy}`,'--no-sandbox','--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    await page.authenticate({ username: process.env[SQUID_PROXY_USERNAME_ENV], password: process.env[SQUID_PROXY_PASSWORD_ENV] });

    const hits = []; const requestStartTime = Date.now();
    page.on('request', req => {
      const url = req.url();
      const isStandardGA4 = url.includes('google-analytics.com/g/collect') || url.includes('google-analytics.com/mp/collect') || url.includes('googletagmanager.com/gtag/js');
      const isCustomGA4 = url.includes('?id=G-') || url.includes('&tid=G-') || url.includes('/collect') || url.includes('/analytics') || url.includes('/ga4') || url.includes('/gtag') || (url.includes('gtm=') && url.includes('G-'));
      if (isStandardGA4 || isCustomGA4) hits.push({ url, t: Date.now()-requestStartTime });
    });

    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
    await new Promise(r => setTimeout(r, CONFIG.waitTime));

    const loadTime = Date.now() - startTime;
    if (!hits.length) {
      if (CONFIG.retryFailedProxies && retryCount === 0) return await testProxy(proxy, 1);
      return { proxy, success: false, hits: 0, loadTime };
    }
    return { proxy, success: true, hits: hits.length, loadTime };
  } catch (err) {
    const loadTime = Date.now() - startTime;
    if (CONFIG.retryFailedProxies && retryCount === 0 && !String(err.message||'').includes('timeout')) return await testProxy(proxy, 1);
    return { proxy, success: false, hits: 0, loadTime, error: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testProxiesConcurrently(proxies, maxConcurrent) {
  const results = [];
  for (let i=0;i<proxies.length;i+=maxConcurrent) {
    const batch = proxies.slice(i, i+maxConcurrent);
    console.log(`\n🚀 Testing batch of ${batch.length} proxies concurrently...`);
    const out = await Promise.allSettled(batch.map(p => testProxy(p)));
    out.forEach((r, idx) => results.push(r.status==='fulfilled'? r.value : { proxy: batch[idx], success:false, hits:0, loadTime:0, error: r.reason?.message || 'Unknown' }));
    if (i+maxConcurrent < proxies.length) await sleep(2000);
  }
  return results;
}

(async function run(){
  console.log('🚀 GA4 Proxy Test');
  console.log('Target URL:', TARGET_URL);
  const results = await testProxiesConcurrently(PROXIES, CONFIG.maxConcurrent);
  const ok = results.some(r => r.success);
  const failRate = results.filter(r=>!r.success).length/results.length;
  console.log(`\nSummary: ${results.filter(r=>r.success).length}/${results.length} proxies succeeded`);
  if (failRate > 0.5) process.exit(1);
  process.exit(ok ? 0 : 1);
})();

