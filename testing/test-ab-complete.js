#!/usr/bin/env node

/**
 * Complete A/B Testing System Verification
 * 
 * This comprehensive test verifies the entire A/B testing system:
 * 1. Algorithm Testing: Validates 50/50 distribution with simulated data
 * 2. Live System Testing: Tests real system using proxies for different IPs
 * 3. Content Verification: Confirms correct A/B variants are displayed
 * 4. Header Synchronization: Verifies Cloudflare Worker ↔ WordPress communication
 * 5. Performance Metrics: Reports system health and identifies issues
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const CONFIG = {
    // Test parameters
    ALGORITHM_SAMPLES: 10000,  // Number of samples for algorithm testing
    PROXY_TIMEOUT: 15000,      // Timeout for proxy requests
    REQUEST_DELAY: 500,        // Delay between proxy requests
    
    // Expected thresholds
    DISTRIBUTION_TOLERANCE: 0.05,  // 5% tolerance for 50/50 split
    MIN_SYNC_RATE: 0.8,           // Minimum 80% header/content sync
    MIN_WORKING_PROXIES: 0.7,     // Minimum 70% of proxies should work
};

// Load credentials if available
const env = {};
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim();
            }
        });
    }
} catch (error) {
    console.log('⚠️  .env file not found - proxy testing will be skipped');
}

// Proxy list for live testing
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

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// === ALGORITHM TESTING ===

function generateVariantSimulation(ip, userAgent, cfRay = '') {
    // Simulate the exact hash algorithm from the Cloudflare Worker
    const input = `${ip}|${userAgent.substring(0, 50)}|${cfRay}`;
    
    try {
        // Use Node.js crypto for consistent hashing
        const hash = crypto.createHash('sha256').update(input).digest();
        return (hash[0] % 2) === 0 ? 'A' : 'B';
    } catch (error) {
        // Fallback to simple hash
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) - hash) + input.charCodeAt(i);
        }
        return (hash % 2) === 0 ? 'A' : 'B';
    }
}

async function testAlgorithmDistribution() {
    console.log('🧮 Testing A/B Algorithm Distribution');
    console.log('====================================');
    console.log(`Simulating ${CONFIG.ALGORITHM_SAMPLES.toLocaleString()} variant assignments...`);
    console.log('');
    
    let countA = 0, countB = 0;
    const distributions = new Map(); // Track distribution by IP prefix
    
    for (let i = 0; i < CONFIG.ALGORITHM_SAMPLES; i++) {
        // Generate random but realistic test data
        const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        const userAgent = `Mozilla/5.0 (Test ${i}) Chrome/${90 + Math.floor(Math.random() * 10)}.0`;
        const cfRay = `ray${i.toString(16)}`;
        
        const variant = generateVariantSimulation(ip, userAgent, cfRay);
        
        if (variant === 'A') countA++;
        else countB++;
        
        // Track distribution by IP prefix for bias detection
        const ipPrefix = ip.split('.').slice(0, 2).join('.');
        if (!distributions.has(ipPrefix)) {
            distributions.set(ipPrefix, { A: 0, B: 0 });
        }
        distributions.get(ipPrefix)[variant]++;
    }
    
    const percentA = (countA / CONFIG.ALGORITHM_SAMPLES * 100).toFixed(2);
    const percentB = (countB / CONFIG.ALGORITHM_SAMPLES * 100).toFixed(2);
    const deviation = Math.abs(50 - parseFloat(percentA));
    
    console.log(`Results: ${countA.toLocaleString()} A (${percentA}%) | ${countB.toLocaleString()} B (${percentB}%)`);
    console.log(`Deviation from 50/50: ${deviation.toFixed(2)}%`);
    
    // Check if distribution is within acceptable tolerance
    const isBalanced = deviation <= (CONFIG.DISTRIBUTION_TOLERANCE * 100);
    console.log(`Distribution Quality: ${isBalanced ? '✅ EXCELLENT' : '⚠️ NEEDS REVIEW'}`);
    
    // Analyze bias across IP ranges
    let maxBias = 0;
    distributions.forEach((dist, ipPrefix) => {
        const total = dist.A + dist.B;
        if (total >= 10) { // Only check ranges with sufficient samples
            const bias = Math.abs(50 - (dist.A / total * 100));
            maxBias = Math.max(maxBias, bias);
        }
    });
    
    console.log(`Maximum IP Range Bias: ${maxBias.toFixed(1)}%`);
    console.log('');
    
    return {
        countA,
        countB,
        percentA: parseFloat(percentA),
        percentB: parseFloat(percentB),
        deviation,
        isBalanced,
        maxBias
    };
}

// === LIVE SYSTEM TESTING ===

function makeProxyRequest(proxyHost, proxyPort) {
    return new Promise((resolve) => {
        if (!env.SQUID_PROXY_USERNAME || !env.SQUID_PROXY_PASSWORD) {
            resolve({
                success: false,
                error: 'Proxy credentials not available',
                proxy: `${proxyHost}:${proxyPort}`
            });
            return;
        }
        
        // Establish CONNECT tunnel for HTTPS
        const connectOptions = {
            hostname: proxyHost,
            port: proxyPort,
            method: 'CONNECT',
            path: 'cloudflare-ab-testing.dilanti.media:443',
            headers: {
                'Proxy-Authorization': `Basic ${Buffer.from(`${env.SQUID_PROXY_USERNAME}:${env.SQUID_PROXY_PASSWORD}`).toString('base64')}`,
            },
            timeout: CONFIG.PROXY_TIMEOUT
        };

        const connectReq = http.request(connectOptions);
        
        connectReq.on('connect', (res, socket, head) => {
            if (res.statusCode !== 200) {
                resolve({
                    success: false,
                    error: `CONNECT failed: ${res.statusCode}`,
                    proxy: `${proxyHost}:${proxyPort}`
                });
                return;
            }

            // Make HTTPS request through tunnel
            const httpsOptions = {
                hostname: 'cloudflare-ab-testing.dilanti.media',
                port: 443,
                path: '/',
                method: 'GET',
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                socket: socket,
                timeout: CONFIG.PROXY_TIMEOUT
            };

            const httpsReq = https.request(httpsOptions, (res) => {
                let body = '';
                
                // Extract variant from headers
                let headerVariant = 'Unknown';
                if (res.headers['x-ab-variant']) {
                    headerVariant = res.headers['x-ab-variant'];
                }
                
                // Check for cookie
                let cookieVariant = 'Unknown';
                if (res.headers['set-cookie']) {
                    const cookies = Array.isArray(res.headers['set-cookie']) 
                        ? res.headers['set-cookie'] 
                        : [res.headers['set-cookie']];
                    
                    const abCookie = cookies.find(c => c.includes('AB_HOMEPAGE_TEST='));
                    if (abCookie) {
                        const match = abCookie.match(/AB_HOMEPAGE_TEST=([AB])/);
                        if (match) cookieVariant = match[1];
                    }
                }
                
                res.on('data', (chunk) => {
                    body += chunk;
                });
                
                res.on('end', () => {
                    // Extract meta tag variants (primary check)
                    const metaVariant = extractMetaVariant(body);
                    const metaTest = extractMetaTest(body);
                    
                    // Extract content variant from actual displayed content
                    const contentVariant = extractContentVariant(body);
                    
                    // Extract debug information
                    const debugMatch = body.match(/<!-- AB-DEBUG: (.*?) -->/);
                    const debugInfo = debugMatch ? debugMatch[1] : null;
                    
                    resolve({
                        success: true,
                        proxy: `${proxyHost}:${proxyPort}`,
                        headerVariant,
                        cookieVariant,
                        metaVariant,
                        metaTest,
                        contentVariant,
                        debugInfo,
                        statusCode: res.statusCode,
                        cfRay: res.headers['cf-ray'],
                        contentLength: body.length,
                        workerActive: res.headers['x-worker-active'] === 'true',
                        hasCorrectButton: body.includes('btn-ab'),
                        hasMetaTags: metaVariant !== 'Unknown'
                    });
                });
            });

            httpsReq.on('error', () => {
                resolve({
                    success: false,
                    error: 'HTTPS request failed',
                    proxy: `${proxyHost}:${proxyPort}`
                });
            });

            httpsReq.on('timeout', () => {
                httpsReq.destroy();
                resolve({
                    success: false,
                    error: 'HTTPS request timeout',
                    proxy: `${proxyHost}:${proxyPort}`
                });
            });

            httpsReq.end();
        });

        connectReq.on('error', () => {
            resolve({
                success: false,
                error: 'CONNECT request failed',
                proxy: `${proxyHost}:${proxyPort}`
            });
        });

        connectReq.on('timeout', () => {
            connectReq.destroy();
            resolve({
                success: false,
                error: 'CONNECT timeout',
                proxy: `${proxyHost}:${proxyPort}`
            });
        });

        connectReq.end();
    });
}

function extractMetaVariant(html) {
    // Extract variant from server-side injected meta tag
    const metaMatch = html.match(/<meta name="cf-ab-variant" content="([AB])"/);
    return metaMatch ? metaMatch[1] : 'Unknown';
}

function extractMetaTest(html) {
    // Extract test name from server-side injected meta tag
    const metaMatch = html.match(/<meta name="cf-ab-test" content="([^"]+)"/);
    return metaMatch ? metaMatch[1] : 'Unknown';
}

function extractContentVariant(html) {
    // Look for actual rendered A/B button content
    const hasButtonA = html.includes('btn-ab btn-a') && html.includes('Click Here &#8211; A');
    const hasButtonB = html.includes('btn-ab btn-b') && html.includes('Click Here &#8211; B');
    
    if (hasButtonA && !hasButtonB) return 'A';
    if (hasButtonB && !hasButtonA) return 'B';
    if (!hasButtonA && !hasButtonB) return 'None';
    return 'Both'; // Shouldn't happen in normal operation
}

async function testLiveSystem() {
    console.log('🌐 Testing Live A/B System');
    console.log('==========================');
    
    if (!env.SQUID_PROXY_USERNAME || !env.SQUID_PROXY_PASSWORD) {
        console.log('⚠️  Proxy credentials not available - skipping live system test');
        console.log('   To enable: Add SQUID_PROXY_USERNAME and SQUID_PROXY_PASSWORD to .env file');
        console.log('');
        return null;
    }
    
    console.log(`Testing ${PROXIES.length} proxy IPs for real-world A/B behavior...`);
    console.log('');
    
    const results = [];
    let successCount = 0;
    let headerCounts = { A: 0, B: 0, Unknown: 0 };
    let metaCounts = { A: 0, B: 0, Unknown: 0 };
    let contentCounts = { A: 0, B: 0, None: 0, Both: 0 };
    let syncedCount = 0;
    let metaSyncedCount = 0;
    let workerActiveCount = 0;
    let metaTagCount = 0;
    
    for (let i = 0; i < PROXIES.length; i++) {
        const [host, port] = PROXIES[i].split(':');
        process.stdout.write(`${PROXIES[i].padEnd(20)} | `);
        
        const result = await makeProxyRequest(host, parseInt(port));
        
        if (result.success && result.statusCode === 200) {
            successCount++;
            headerCounts[result.headerVariant]++;
            metaCounts[result.metaVariant]++;
            contentCounts[result.contentVariant]++;
            
            if (result.headerVariant === result.contentVariant && result.headerVariant !== 'Unknown') {
                syncedCount++;
            }
            
            if (result.metaVariant === result.contentVariant && result.metaVariant !== 'Unknown') {
                metaSyncedCount++;
            }
            
            if (result.workerActive) {
                workerActiveCount++;
            }
            
            if (result.hasMetaTags) {
                metaTagCount++;
            }
            
            const sync = result.headerVariant === result.contentVariant ? '✅' : '❌';
            const metaSync = result.metaVariant === result.contentVariant ? '✅' : '❌';
            const worker = result.workerActive ? '✅' : '❌';
            const meta = result.hasMetaTags ? '✅' : '❌';
            console.log(`H:${result.headerVariant}→M:${result.metaVariant}→C:${result.contentVariant} | ${metaSync} | ${meta} | ${worker} | ${(result.contentLength/1000).toFixed(1)}kb`);
        } else {
            const error = result.error || 'Unknown error';
            console.log(`❌ ${error}`);
        }
        
        results.push(result);
        
        // Delay between requests to avoid overwhelming proxies
        if (i < PROXIES.length - 1) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
        }
    }
    
    console.log('');
    
    return {
        results,
        successCount,
        totalTests: PROXIES.length,
        headerCounts,
        metaCounts,
        contentCounts,
        syncedCount,
        metaSyncedCount,
        workerActiveCount,
        metaTagCount,
        workingProxyRate: successCount / PROXIES.length,
        syncRate: successCount > 0 ? syncedCount / successCount : 0,
        metaSyncRate: successCount > 0 ? metaSyncedCount / successCount : 0,
        workerActiveRate: successCount > 0 ? workerActiveCount / successCount : 0,
        metaTagRate: successCount > 0 ? metaTagCount / successCount : 0
    };
}

// === REPORTING ===

function generateReport(algorithmResults, liveResults) {
    console.log('📊 Complete A/B Testing System Report');
    console.log('=====================================');
    console.log('');
    
    // Algorithm Results
    console.log('🧮 Algorithm Performance:');
    console.log(`   Distribution: ${algorithmResults.percentA}% A | ${algorithmResults.percentB}% B`);
    console.log(`   Quality: ${algorithmResults.isBalanced ? '✅ Excellent' : '⚠️ Needs Review'} (${algorithmResults.deviation.toFixed(2)}% deviation)`);
    console.log(`   IP Bias: ${algorithmResults.maxBias.toFixed(1)}% maximum`);
    console.log('');
    
    // Live System Results
    if (liveResults) {
        const headerTotal = liveResults.headerCounts.A + liveResults.headerCounts.B;
        const metaTotal = liveResults.metaCounts.A + liveResults.metaCounts.B;
        const contentTotal = liveResults.contentCounts.A + liveResults.contentCounts.B;
        
        console.log('🌐 Live System Performance:');
        console.log(`   Working Proxies: ${liveResults.successCount}/${liveResults.totalTests} (${(liveResults.workingProxyRate * 100).toFixed(1)}%)`);
        console.log(`   Worker Active: ${liveResults.workerActiveCount}/${liveResults.successCount} (${(liveResults.workerActiveRate * 100).toFixed(1)}%)`);
        console.log(`   Meta Tags Present: ${liveResults.metaTagCount}/${liveResults.successCount} (${(liveResults.metaTagRate * 100).toFixed(1)}%)`);
        console.log(`   Header→Content Sync: ${liveResults.syncedCount}/${liveResults.successCount} (${(liveResults.syncRate * 100).toFixed(1)}%)`);
        console.log(`   Meta→Content Sync: ${liveResults.metaSyncedCount}/${liveResults.successCount} (${(liveResults.metaSyncRate * 100).toFixed(1)}%)`);
        
        if (headerTotal > 0) {
            const headerPercentA = (liveResults.headerCounts.A / headerTotal * 100).toFixed(1);
            const headerPercentB = (liveResults.headerCounts.B / headerTotal * 100).toFixed(1);
            console.log(`   Header Distribution: ${headerPercentA}% A | ${headerPercentB}% B`);
        }
        
        if (metaTotal > 0) {
            const metaPercentA = (liveResults.metaCounts.A / metaTotal * 100).toFixed(1);
            const metaPercentB = (liveResults.metaCounts.B / metaTotal * 100).toFixed(1);
            console.log(`   Meta Tag Distribution: ${metaPercentA}% A | ${metaPercentB}% B`);
        }
        
        if (contentTotal > 0) {
            const contentPercentA = (liveResults.contentCounts.A / contentTotal * 100).toFixed(1);
            const contentPercentB = (liveResults.contentCounts.B / contentTotal * 100).toFixed(1);
            console.log(`   Content Distribution: ${contentPercentA}% A | ${contentPercentB}% B`);
        }
        console.log('');
    }
    
    // Overall Assessment
    console.log('🎯 System Health Assessment:');
    
    const algorithmHealth = algorithmResults.isBalanced;
    console.log(`   Algorithm: ${algorithmHealth ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    
    if (liveResults) {
        const proxyHealth = liveResults.workingProxyRate >= CONFIG.MIN_WORKING_PROXIES;
        const syncHealth = liveResults.syncRate >= CONFIG.MIN_SYNC_RATE;
        const metaSyncHealth = liveResults.metaSyncRate >= CONFIG.MIN_SYNC_RATE;
        const metaTagHealth = liveResults.metaTagRate >= 0.8; // 80% of responses should have meta tags
        const workerHealth = liveResults.workerActiveRate >= 0.9;
        
        console.log(`   Proxy Connectivity: ${proxyHealth ? '✅ GOOD' : '⚠️ LIMITED'}`);
        console.log(`   Header Sync: ${syncHealth ? '✅ EXCELLENT' : '❌ POOR'}`);
        console.log(`   Meta Tag Presence: ${metaTagHealth ? '✅ EXCELLENT' : '❌ POOR'}`);
        console.log(`   Meta Tag Sync: ${metaSyncHealth ? '✅ EXCELLENT' : '❌ POOR'}`);
        console.log(`   Worker Status: ${workerHealth ? '✅ ACTIVE' : '❌ ISSUES'}`);
        
        const overallHealth = algorithmHealth && proxyHealth && syncHealth && metaSyncHealth && metaTagHealth && workerHealth;
        
        console.log('');
        console.log(`🏆 Overall Status: ${overallHealth ? '✅ SYSTEM HEALTHY' : '⚠️ ISSUES DETECTED'}`);
        
        if (!overallHealth) {
            console.log('');
            console.log('🔧 Recommended Actions:');
            if (!algorithmHealth) console.log('   • Review hash algorithm for better distribution');
            if (!proxyHealth) console.log('   • Check proxy connectivity and credentials');
            if (!syncHealth) console.log('   • Verify Cloudflare Worker header configuration');
            if (!metaTagHealth) console.log('   • Check WordPress meta tag injection (wp_head hook)');
            if (!metaSyncHealth) console.log('   • Verify meta tag sync with content variants');
            if (!workerHealth) console.log('   • Check Cloudflare Worker deployment status');
        }
    } else {
        console.log(`   Live System: ⚠️ SKIPPED (no proxy credentials)`);
        console.log('');
        console.log(`🏆 Overall Status: ${algorithmHealth ? '✅ ALGORITHM HEALTHY' : '⚠️ ALGORITHM ISSUES'}`);
    }
    
    console.log('');
}

// === MAIN EXECUTION ===

async function runCompleteTest() {
    console.log('🚀 Complete A/B Testing System Verification');
    console.log('===========================================');
    console.log('This comprehensive test validates the entire A/B testing system');
    console.log('from algorithm correctness to live system performance.');
    console.log('');
    
    try {
        // Test algorithm distribution
        const algorithmResults = await testAlgorithmDistribution();
        
        // Test live system if credentials available
        const liveResults = await testLiveSystem();
        
        // Generate comprehensive report
        generateReport(algorithmResults, liveResults);
        
        // Exit with appropriate code
        const hasIssues = !algorithmResults.isBalanced || 
                         (liveResults && (liveResults.syncRate < CONFIG.MIN_SYNC_RATE || 
                                         liveResults.metaSyncRate < CONFIG.MIN_SYNC_RATE ||
                                         liveResults.metaTagRate < 0.8 ||
                                         liveResults.workingProxyRate < CONFIG.MIN_WORKING_PROXIES));
        
        process.exit(hasIssues ? 1 : 0);
        
    } catch (error) {
        console.error('❌ Test execution failed:', error.message);
        process.exit(1);
    }
}

// Run the complete test
runCompleteTest();