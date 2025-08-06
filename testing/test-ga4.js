// test-ga4.js
require('dotenv').config();
const puppeteer = require('puppeteer'); // or 'puppeteer-core' if you have a local Chromium

// Environment variables validation
if (!process.env.SQUID_PROXY_USERNAME || !process.env.SQUID_PROXY_PASSWORD) {
  console.error('❌ Missing required environment variables: SQUID_PROXY_USERNAME, SQUID_PROXY_PASSWORD');
  process.exit(1);
}

const PROXIES = [
  '23.19.98.55:8800',
  '23.19.98.180:8800',
  '173.234.232.213:8800',
  '23.19.98.82:8800',
  '23.19.98.57:8800',
  '173.234.232.82:8800',
  '173.232.127.234:8800',
  '173.234.194.122:8800',
  '173.234.194.169:8800',
  '173.232.127.166:8800'
];

// The page you want to test
const TARGET_URL = process.env.TARGET_URL || 'https://your-site-with-ab-tests.com';

// Configuration
const CONFIG = {
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT) || 3,
  timeout: parseInt(process.env.TIMEOUT) || 60000,
  waitTime: parseInt(process.env.WAIT_TIME) || 10000,
  retryFailedProxies: process.env.RETRY_FAILED === 'true',
  logDetailedHits: process.env.LOG_DETAILED_HITS === 'true',
  logDiagnostics: process.env.LOG_DIAGNOSTICS !== 'false' // Default to true
};

async function testProxy(proxy, retryCount = 0) {
  const isRetry = retryCount > 0;
  console.log(`\n🔎 Testing via proxy ${proxy}${isRetry ? ` (retry ${retryCount})` : ''}`);

  let browser;
  const startTime = Date.now();

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=${proxy}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const page = await browser.newPage();

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Squid proxy authentication
    await page.authenticate({
      username: process.env.SQUID_PROXY_USERNAME,
      password: process.env.SQUID_PROXY_PASSWORD
    });

    // Enhanced GA4 hit detection with broader monitoring
    const hits = [];
    const allRequests = [];
    const requestStartTime = Date.now();

    page.on('request', req => {
      const url = req.url();

      // Log all analytics-related requests for debugging
      if (url.includes('google-analytics.com') ||
        url.includes('googletagmanager.com') ||
        url.includes('gtag') ||
        url.includes('analytics') ||
        url.includes('gtm.js')) {
        allRequests.push({
          url: url,
          type: 'request',
          timestamp: new Date().toISOString()
        });

        if (CONFIG.logDetailedHits) {
          console.log(`  🔍 Analytics request: ${url.substring(0, 100)}...`);
        }
      }

      // Detect GA4 hits (including custom/proxy implementations)
      const isStandardGA4 = url.includes('google-analytics.com/g/collect') ||
        url.includes('google-analytics.com/mp/collect') ||
        url.includes('googletagmanager.com/gtag/js');

      const isCustomGA4 = url.includes('?id=G-') || // Custom proxy with GA4 ID
        url.includes('&tid=G-') || // GA4 tracking ID in params
        url.includes('/collect') || // Generic collect endpoint
        url.includes('/analytics') || // Custom analytics endpoint
        url.includes('/ga4') || // Custom GA4 endpoint
        url.includes('/gtag') || // Custom gtag endpoint
        (url.includes('gtm=') && url.includes('G-')); // GTM with GA4 ID

      if (isStandardGA4 || isCustomGA4) {

        const headers = req.headers();
        const hitData = {
          url: url,
          timestamp: new Date().toISOString(),
          userAgent: headers['user-agent'],
          method: req.method(),
          proxy: proxy,
          timeSincePageLoad: Date.now() - requestStartTime
        };

        // Capture payload for POST requests (be careful with sensitive data)
        if (req.method() === 'POST' && CONFIG.logDetailedHits) {
          try {
            hitData.payload = req.postData();
          } catch (e) {
            hitData.payload = 'Unable to capture payload';
          }
        }

        hits.push(hitData);

        const hitType = isStandardGA4 ? "Standard GA4" : "Custom GA4";
        console.log(`  ✅ ${hitType} hit detected: ${url.substring(0, 80)}...`);
      }
    });

    // Handle failed requests
    page.on('requestfailed', req => {
      const url = req.url();
      if (url.includes('google-analytics.com') ||
        url.includes('googletagmanager.com') ||
        url.includes('analytics') ||
        url.includes('gtag')) {
        allRequests.push({
          url: url,
          type: 'failed',
          error: req.failure().errorText,
          timestamp: new Date().toISOString()
        });
        console.warn(`  ⚠️ GA4 request failed: ${req.failure().errorText} - ${url.substring(0, 80)}...`);
      }
    });

    // Navigate to target URL
    console.log(`  📍 Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout
    });

    // Check if page loaded successfully
    const title = await page.title();
    console.log(`  📄 Page loaded: "${title}"`);

    // Give AB tests time to render & fire analytics
    console.log(`  ⏱️ Waiting ${CONFIG.waitTime}ms for analytics to fire...`);
    await sleep(CONFIG.waitTime);

    // Additional diagnostic checks for sites with no hits
    if (hits.length === 0) {
      console.log(`  🔍 No GA4 hits found. Running diagnostics...`);

      try {
        // Check for GA4 measurement IDs in scripts
        const ga4Info = await page.evaluate(() => {
          const scripts = Array.from(document.querySelectorAll('script'));
          const ga4Patterns = [];
          const measurementIds = [];

          scripts.forEach(script => {
            const content = script.src || script.innerHTML;

            // Look for GA4 measurement IDs (G-XXXXXXXXXX)
            const ga4Matches = content.match(/G-[A-Z0-9]{10,}/g);
            if (ga4Matches) {
              ga4Matches.forEach(id => {
                if (!measurementIds.includes(id)) {
                  measurementIds.push(id);
                }
              });
            }

            // Look for custom analytics patterns
            if (content.includes('/collect') ||
              content.includes('/analytics') ||
              content.includes('/ga4') ||
              content.includes('/gtag') ||
              content.includes('ufsg')) {
              ga4Patterns.push(content.substring(0, 100));
            }
          });

          return { measurementIds, ga4Patterns };
        });

        if (ga4Info.measurementIds.length > 0) {
          console.log(`  📊 GA4 Measurement IDs found: ${ga4Info.measurementIds.join(', ')}`);
        }

        if (ga4Info.ga4Patterns.length > 0) {
          console.log(`  📊 Custom analytics patterns detected:`);
          ga4Info.ga4Patterns.forEach((pattern, i) => {
            console.log(`    ${i + 1}. ${pattern}...`);
          });
        }

        // Check if dataLayer exists and has content
        const dataLayerInfo = await page.evaluate(() => {
          if (typeof window.dataLayer !== 'undefined') {
            return {
              exists: true,
              length: window.dataLayer.length,
              sample: window.dataLayer.slice(0, 2)
            };
          }
          return { exists: false };
        });

        if (dataLayerInfo.exists) {
          console.log(`  📊 dataLayer found with ${dataLayerInfo.length} items`);
          if (CONFIG.logDetailedHits) {
            console.log(`    Sample: ${JSON.stringify(dataLayerInfo.sample)}`);
          }
        } else {
          console.log(`  ❌ No dataLayer found`);
        }

        // Log all analytics-related requests for debugging
        if (allRequests.length > 0) {
          console.log(`  📊 Total analytics-related requests: ${allRequests.length}`);
          if (CONFIG.logDetailedHits) {
            allRequests.forEach((req, i) => {
              console.log(`    ${i + 1}. [${req.type}] ${req.url.substring(0, 100)}...`);
            });
          }

          // Analyze request patterns for custom implementations
          const customRequests = allRequests.filter(req =>
            !req.url.includes('google-analytics.com') &&
            !req.url.includes('googletagmanager.com')
          );

          if (customRequests.length > 0) {
            console.log(`  🔍 ${customRequests.length} custom analytics requests detected (likely server-side proxy)`);
            customRequests.forEach((req, i) => {
              console.log(`    ${i + 1}. ${req.url.substring(0, 100)}...`);
            });
          }
        } else {
          console.log(`  ❌ No analytics-related network requests detected`);
        }

      } catch (diagError) {
        console.log(`  ⚠️ Diagnostic check failed: ${diagError.message}`);
      }
    }

    // Validate results
    const loadTime = Date.now() - startTime;
    console.log(`  📊 Total test time: ${loadTime}ms`);

    if (!hits.length) {
      console.warn(`  ⚠️ No GA4 hits detected via ${proxy}`);

      // Retry logic for failed proxies
      if (CONFIG.retryFailedProxies && retryCount === 0) {
        console.log(`  🔄 Retrying proxy ${proxy}...`);
        return await testProxy(proxy, 1);
      }

      return {
        proxy,
        success: false,
        hits: 0,
        loadTime,
        error: 'No GA4 hits detected'
      };
    } else {
      console.log(`  ✅ ${hits.length} GA4 hits detected via ${proxy}`);

      if (CONFIG.logDetailedHits) {
        hits.forEach((hit, i) => {
          console.log(`    Hit ${i + 1}: ${hit.timestamp} (+${hit.timeSincePageLoad}ms)`);
          if (hit.payload && hit.payload.length < 200) {
            console.log(`      Payload: ${hit.payload}`);
          }
        });
      }

      return {
        proxy,
        success: true,
        hits: hits.length,
        loadTime,
        hitDetails: hits
      };
    }

  } catch (err) {
    const loadTime = Date.now() - startTime;
    console.error(`  ❌ Error with proxy ${proxy}:`, err.message);

    // Retry logic for errors
    if (CONFIG.retryFailedProxies && retryCount === 0 && !err.message.includes('timeout')) {
      console.log(`  🔄 Retrying proxy ${proxy} due to error...`);
      return await testProxy(proxy, 1);
    }

    return {
      proxy,
      success: false,
      hits: 0,
      loadTime,
      error: err.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Simple pause helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test multiple proxies concurrently
async function testProxiesConcurrently(proxies, maxConcurrent) {
  const results = [];

  for (let i = 0; i < proxies.length; i += maxConcurrent) {
    const batch = proxies.slice(i, i + maxConcurrent);
    console.log(`\n🚀 Testing batch of ${batch.length} proxies concurrently...`);

    const batchPromises = batch.map(proxy => testProxy(proxy));
    const batchResults = await Promise.allSettled(batchPromises);

    // Process results
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          proxy: batch[index],
          success: false,
          hits: 0,
          loadTime: 0,
          error: result.reason.message || 'Unknown error'
        });
      }
    });

    // Brief pause between batches
    if (i + maxConcurrent < proxies.length) {
      await sleep(2000);
    }
  }

  return results;
}

// Generate summary report
function generateSummary(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY REPORT');
  console.log('='.repeat(60));

  console.log(`Total proxies tested: ${results.length}`);
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`Success rate: ${((successful.length / results.length) * 100).toFixed(1)}%`);

  if (successful.length > 0) {
    const totalHits = successful.reduce((sum, r) => sum + r.hits, 0);
    const avgHits = (totalHits / successful.length).toFixed(1);
    const avgLoadTime = (successful.reduce((sum, r) => sum + r.loadTime, 0) / successful.length).toFixed(0);

    console.log(`Total GA4 hits detected: ${totalHits}`);
    console.log(`Average hits per successful proxy: ${avgHits}`);
    console.log(`Average load time: ${avgLoadTime}ms`);

    console.log('\n✅ Successful proxies:');
    successful.forEach(r => {
      console.log(`  ${r.proxy}: ${r.hits} hits (${r.loadTime}ms)`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed proxies:');
    failed.forEach(r => {
      console.log(`  ${r.proxy}: ${r.error} (${r.loadTime}ms)`);
    });
  }

  console.log('='.repeat(60));
}

// Main execution
(async () => {
  console.log('🚀 Starting GA4 Proxy Testing Script');
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`Max concurrent: ${CONFIG.maxConcurrent}`);
  console.log(`Timeout: ${CONFIG.timeout}ms`);
  console.log(`Wait time: ${CONFIG.waitTime}ms`);
  console.log(`Retry failed: ${CONFIG.retryFailedProxies}`);
  console.log(`Log detailed hits: ${CONFIG.logDetailedHits}`);

  const startTime = Date.now();

  try {
    const results = await testProxiesConcurrently(PROXIES, CONFIG.maxConcurrent);
    const totalTime = Date.now() - startTime;

    generateSummary(results);

    console.log(`\n⏱️ Total execution time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log('✨ All proxies tested successfully.');

    // Exit with error code if too many proxies failed
    const failureRate = results.filter(r => !r.success).length / results.length;
    if (failureRate > 0.5) {
      console.warn(`\n⚠️ High failure rate detected (${(failureRate * 100).toFixed(1)}%)`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Fatal error during testing:', error);
    process.exit(1);
  }
})();
