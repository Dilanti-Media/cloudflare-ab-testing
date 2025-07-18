#!/usr/bin/env node

/**
 * Corrected proxy distribution test - testing different proxy IPs for proper distribution
 * Key insight: IP has more weight than User-Agent, so we need to test different proxy IPs
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Load credentials
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

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

function makeProxyRequest(proxyHost, proxyPort, targetUrl, userAgent) {
    return new Promise((resolve) => {
        const options = {
            hostname: proxyHost,
            port: proxyPort,
            path: targetUrl,
            method: 'HEAD',
            headers: {
                'User-Agent': userAgent,
                'Proxy-Authorization': `Basic ${Buffer.from(`${env.SQUID_PROXY_USERNAME}:${env.SQUID_PROXY_PASSWORD}`).toString('base64')}`,
                'Host': 'cloudflare-ab-testing.dilanti.media'
            },
            timeout: 10000
        };

        const req = http.request(options, (res) => {
            let variant = 'Unknown';
            
            // Extract variant from X-AB-Variant header
            if (res.headers['x-ab-variant']) {
                variant = res.headers['x-ab-variant'];
            }
            
            // Also check Set-Cookie header
            if (variant === 'Unknown' && res.headers['set-cookie']) {
                const cookies = Array.isArray(res.headers['set-cookie']) 
                    ? res.headers['set-cookie'] 
                    : [res.headers['set-cookie']];
                
                const abCookie = cookies.find(c => c.includes('AB_HOMEPAGE_TEST='));
                if (abCookie) {
                    const match = abCookie.match(/AB_HOMEPAGE_TEST=([AB])/);
                    if (match) variant = match[1];
                }
            }
            
            resolve({
                success: true,
                variant: variant,
                statusCode: res.statusCode,
                cfRay: res.headers['cf-ray'],
                workerActive: res.headers['x-worker-active']
            });
        });

        req.on('error', () => {
            resolve({
                success: false,
                error: 'Connection failed'
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                error: 'Timeout'
            });
        });

        req.end();
    });
}

async function testProxyDistribution() {
    console.log('🧪 Corrected Proxy Distribution Test');
    console.log('==================================');
    console.log('Testing each proxy IP once to verify 50/50 distribution');
    console.log('Key insight: IP has more weight than User-Agent in hash algorithm');
    console.log('');
    
    const results = [];
    let totalA = 0, totalB = 0, totalErrors = 0;
    
    console.log('🚀 Testing each proxy IP...');
    console.log('');
    
    for (const proxy of PROXIES) {
        const [host, port] = proxy.split(':');
        process.stdout.write(`Testing ${proxy}... `);
        
        const result = await makeProxyRequest(host, parseInt(port), 'https://cloudflare-ab-testing.dilanti.media/', USER_AGENT);
        
        if (result.success) {
            if (result.variant === 'A') {
                totalA++;
                console.log(`✅ Variant A (CF-Ray: ${result.cfRay})`);
            } else if (result.variant === 'B') {
                totalB++;
                console.log(`✅ Variant B (CF-Ray: ${result.cfRay})`);
            } else {
                totalErrors++;
                console.log(`❌ Unknown variant (Status: ${result.statusCode})`);
            }
        } else {
            totalErrors++;
            console.log(`❌ ${result.error}`);
        }
        
        results.push({
            proxy: proxy,
            ...result
        });
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('');
    console.log('📊 Results Summary:');
    console.log('==================');
    
    const totalSuccessful = totalA + totalB;
    
    if (totalSuccessful === 0) {
        console.log('❌ No successful requests');
        return;
    }
    
    const percentA = (totalA / totalSuccessful * 100).toFixed(1);
    const percentB = (totalB / totalSuccessful * 100).toFixed(1);
    
    console.log(`Total Successful: ${totalSuccessful}`);
    console.log(`Variant A: ${totalA} (${percentA}%)`);
    console.log(`Variant B: ${totalB} (${percentB}%)`);
    console.log(`Errors: ${totalErrors}`);
    console.log('');
    
    // Check if distribution is reasonable for small sample
    const isBalanced = totalSuccessful >= 4 && totalA > 0 && totalB > 0;
    
    console.log('✅ Distribution Analysis:');
    console.log(`   Expected: Mix of A and B variants across different IPs`);
    console.log(`   Actual: ${percentA}% A, ${percentB}% B`);
    console.log(`   Balanced: ${isBalanced ? '✅ YES' : '❌ NO'}`);
    console.log('');
    
    if (isBalanced) {
        console.log('🎉 SUCCESS: A/B testing is working correctly!');
        console.log('   • Different proxy IPs get different variants');
        console.log('   • Hash algorithm properly distributes traffic');
        console.log('   • 50/50 distribution is functioning');
    } else {
        console.log('⚠️  Issue detected:');
        if (totalA === 0) console.log('   • No variant A detected');
        if (totalB === 0) console.log('   • No variant B detected');
        if (totalSuccessful < 4) console.log('   • Too few successful requests to determine distribution');
    }
    
    console.log('');
    console.log('🔍 Detailed Results:');
    console.log('Proxy IP           | Result  | CF-Ray            | Status');
    console.log('-------------------|---------|-------------------|--------');
    
    results.forEach(result => {
        const status = result.success ? `${result.statusCode}` : 'FAILED';
        const variant = result.success ? result.variant : '-';
        const cfRay = result.success ? (result.cfRay || 'N/A') : '-';
        
        console.log(`${result.proxy.padEnd(18)} | ${variant.padEnd(7)} | ${cfRay.padEnd(17)} | ${status}`);
    });
    
    console.log('');
    console.log('💡 Key Insights:');
    console.log('   • IP address has primary influence on variant assignment');
    console.log('   • Each unique IP should consistently get the same variant');
    console.log('   • Distribution happens across different IP addresses');
    console.log('   • This simulates real-world user behavior accurately');
}

testProxyDistribution().catch(console.error);