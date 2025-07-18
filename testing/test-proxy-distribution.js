#!/usr/bin/env node

/**
 * Node.js version of proxy-based A/B testing distribution test
 * Tests the 50/50 distribution using squid proxies to simulate different IP addresses
 */

const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    URL: 'https://cloudflare-ab-testing.dilanti.media/',
    REQUESTS_PER_PROXY: 20,
    TIMEOUT: 30000,
    PROXIES: [
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
    ],
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59'
    ]
};

// Load environment variables
function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        console.error('❌ .env file not found. Please create it with SQUID_PROXY_USERNAME and SQUID_PROXY_PASSWORD');
        process.exit(1);
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            env[key.trim()] = value.trim();
        }
    });
    
    if (!env.SQUID_PROXY_USERNAME || !env.SQUID_PROXY_PASSWORD) {
        console.error('❌ SQUID_PROXY_USERNAME and SQUID_PROXY_PASSWORD must be set in .env');
        process.exit(1);
    }
    
    return env;
}

// Make HTTP request through proxy
function makeProxyRequest(proxyHost, proxyPort, targetUrl, userAgent, credentials) {
    return new Promise((resolve, reject) => {
        const targetParsed = url.parse(targetUrl);
        const auth = `${credentials.SQUID_PROXY_USERNAME}:${credentials.SQUID_PROXY_PASSWORD}`;
        const authHeader = `Basic ${Buffer.from(auth).toString('base64')}`;
        
        const options = {
            hostname: proxyHost,
            port: proxyPort,
            path: targetUrl,
            method: 'HEAD',
            headers: {
                'User-Agent': userAgent,
                'Proxy-Authorization': authHeader,
                'Host': targetParsed.hostname
            },
            timeout: CONFIG.TIMEOUT
        };
        
        const req = http.request(options, (res) => {
            let variant = null;
            
            // Extract variant from Set-Cookie header
            const setCookieHeader = res.headers['set-cookie'];
            if (setCookieHeader) {
                const cookie = setCookieHeader.find(c => c.includes('AB_HOMEPAGE_TEST='));
                if (cookie) {
                    const match = cookie.match(/AB_HOMEPAGE_TEST=([AB])/);
                    if (match) variant = match[1];
                }
            }
            
            // If no cookie, check X-AB-Variant header
            if (!variant && res.headers['x-ab-variant']) {
                variant = res.headers['x-ab-variant'];
            }
            
            // Default to A if nothing found
            if (!variant) variant = 'A';
            
            resolve({
                success: true,
                variant: variant,
                statusCode: res.statusCode,
                headers: res.headers
            });
        });
        
        req.on('error', (err) => {
            resolve({
                success: false,
                error: err.message
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                error: 'Request timeout'
            });
        });
        
        req.end();
    });
}

// Test single proxy
async function testProxy(proxy, credentials) {
    const [host, port] = proxy.split(':');
    const results = { A: 0, B: 0, errors: 0 };
    
    console.log(`Testing proxy: ${proxy}`);
    
    for (let i = 0; i < CONFIG.REQUESTS_PER_PROXY; i++) {
        const userAgent = CONFIG.USER_AGENTS[i % CONFIG.USER_AGENTS.length];
        
        try {
            const result = await makeProxyRequest(host, parseInt(port), CONFIG.URL, userAgent, credentials);
            
            if (result.success) {
                results[result.variant]++;
                process.stdout.write('.');
            } else {
                results.errors++;
                process.stdout.write('x');
            }
        } catch (error) {
            results.errors++;
            process.stdout.write('x');
        }
    }
    
    console.log(''); // New line after dots
    return results;
}

// Main test function
async function runTests() {
    console.log('🧪 Proxy-Based A/B Testing Distribution Test (Node.js)');
    console.log('====================================================');
    console.log(`URL: ${CONFIG.URL}`);
    console.log(`Proxies: ${CONFIG.PROXIES.length}`);
    console.log(`Requests per proxy: ${CONFIG.REQUESTS_PER_PROXY}`);
    console.log(`Total requests: ${CONFIG.PROXIES.length * CONFIG.REQUESTS_PER_PROXY}`);
    console.log('');
    
    const credentials = loadEnvFile();
    
    const overallResults = { A: 0, B: 0, errors: 0 };
    const proxyResults = new Map();
    
    console.log('🚀 Testing proxies...');
    
    // Test each proxy
    for (const proxy of CONFIG.PROXIES) {
        const results = await testProxy(proxy, credentials);
        proxyResults.set(proxy, results);
        
        // Add to overall results
        overallResults.A += results.A;
        overallResults.B += results.B;
        overallResults.errors += results.errors;
    }
    
    console.log('');
    console.log('📊 Overall Results:');
    
    const totalSuccessful = overallResults.A + overallResults.B;
    
    if (totalSuccessful === 0) {
        console.log('❌ No successful requests. Check proxy configuration.');
        return;
    }
    
    const percentA = (overallResults.A / totalSuccessful * 100).toFixed(2);
    const percentB = (overallResults.B / totalSuccessful * 100).toFixed(2);
    
    console.log(`   Variant A: ${overallResults.A} (${percentA}%)`);
    console.log(`   Variant B: ${overallResults.B} (${percentB}%)`);
    console.log(`   Total successful: ${totalSuccessful}`);
    console.log(`   Errors: ${overallResults.errors}`);
    console.log('');
    
    // Check if distribution is balanced (45-55% range)
    const isBalanced = percentA >= 45 && percentA <= 55 && percentB >= 45 && percentB <= 55;
    
    console.log('✅ Distribution Analysis:');
    console.log('   Expected: ~50% A, ~50% B');
    console.log(`   Actual: ${percentA}% A, ${percentB}% B`);
    console.log(`   Balanced: ${isBalanced ? '✅ YES' : '❌ NO'}`);
    
    if (!isBalanced) {
        console.log('   ⚠️  Distribution is outside acceptable range (45-55%)');
    }
    
    console.log('');
    console.log('🔍 Per-Proxy Results:');
    console.log('Proxy                    | Requests | A    | B    | A%    | B%    | Errors');
    console.log('-------------------------|----------|------|------|-------|-------|-------');
    
    for (const [proxy, results] of proxyResults) {
        const total = results.A + results.B;
        if (total > 0) {
            const aPercent = (results.A / total * 100).toFixed(1);
            const bPercent = (results.B / total * 100).toFixed(1);
            
            console.log(`${proxy.padEnd(24)} | ${total.toString().padStart(8)} | ${results.A.toString().padStart(4)} | ${results.B.toString().padStart(4)} | ${(aPercent + '%').padStart(5)} | ${(bPercent + '%').padStart(5)} | ${results.errors.toString().padStart(6)}`);
        } else {
            console.log(`${proxy.padEnd(24)} | ${'-'.padStart(8)} | ${'-'.padStart(4)} | ${'-'.padStart(4)} | ${'-'.padStart(5)} | ${'-'.padStart(5)} | ${CONFIG.REQUESTS_PER_PROXY.toString().padStart(6)}`);
        }
    }
    
    console.log('');
    console.log('🎯 Key Insights:');
    console.log('   • Each proxy IP should get consistent variants (due to IP-based hashing)');
    console.log('   • Overall distribution should be close to 50/50 across all proxies');
    console.log('   • Individual proxy results may vary due to small sample sizes');
    
    console.log('');
    console.log('💡 Manual Testing Tips:');
    console.log(`   1. Visit: ${CONFIG.URL}`);
    console.log('   2. Check browser console for debug output');
    console.log(`   3. Force variant with: ${CONFIG.URL}?AB_HOMEPAGE_TEST=B`);
    console.log('   4. Use different browsers/devices for variety');
}

// Run the tests
runTests().catch(console.error);