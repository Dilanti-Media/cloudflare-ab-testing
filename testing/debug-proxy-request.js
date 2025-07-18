#!/usr/bin/env node

/**
 * Debug script to test a single proxy request and see what the worker returns
 */

const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');

// Load credentials
const envPath = '.env';
if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found.');
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

// Test with a specific proxy and user agent
const PROXY = '23.19.98.55:8800';
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
];

function makeProxyRequest(proxyHost, proxyPort, targetUrl, userAgent) {
    return new Promise((resolve, reject) => {
        const targetParsed = url.parse(targetUrl);
        const auth = `${env.SQUID_PROXY_USERNAME}:${env.SQUID_PROXY_PASSWORD}`;
        const authHeader = `Basic ${Buffer.from(auth).toString('base64')}`;
        
        const options = {
            hostname: proxyHost,
            port: proxyPort,
            path: targetUrl,
            method: 'GET', // Use GET to see full response
            headers: {
                'User-Agent': userAgent,
                'Proxy-Authorization': authHeader,
                'Host': targetParsed.hostname,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    success: true,
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
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

async function testProxyRequests() {
    console.log('🔍 Debug: Testing proxy requests to understand variant assignment');
    console.log('==============================================================');
    console.log(`Proxy: ${PROXY}`);
    console.log(`Target: https://cloudflare-ab-testing.dilanti.media/`);
    console.log('');
    
    const [host, port] = PROXY.split(':');
    
    for (let i = 0; i < USER_AGENTS.length; i++) {
        const userAgent = USER_AGENTS[i];
        console.log(`Test ${i + 1}: ${userAgent.substring(0, 50)}...`);
        
        try {
            const result = await makeProxyRequest(
                host, 
                parseInt(port), 
                'https://cloudflare-ab-testing.dilanti.media/', 
                userAgent
            );
            
            if (result.success) {
                // Extract variant from headers
                let variant = 'Unknown';
                if (result.headers['set-cookie']) {
                    const cookies = Array.isArray(result.headers['set-cookie']) 
                        ? result.headers['set-cookie'] 
                        : [result.headers['set-cookie']];
                    
                    const abCookie = cookies.find(c => c.includes('AB_HOMEPAGE_TEST='));
                    if (abCookie) {
                        const match = abCookie.match(/AB_HOMEPAGE_TEST=([AB])/);
                        if (match) variant = match[1];
                    }
                }
                
                if (variant === 'Unknown' && result.headers['x-ab-variant']) {
                    variant = result.headers['x-ab-variant'];
                }
                
                console.log(`   Status: ${result.statusCode}`);
                console.log(`   Variant: ${variant}`);
                console.log(`   Worker Active: ${result.headers['x-worker-active'] || 'No'}`);
                console.log(`   CF-Ray: ${result.headers['cf-ray'] || 'No'}`);
                console.log('');
                
                // Check if there's debug info in the response body
                if (result.body && result.body.includes('VARIANT GENERATION DEBUG')) {
                    console.log('🔍 Debug output found in response body:');
                    const debugLines = result.body.split('\n').filter(line => 
                        line.includes('VARIANT GENERATION DEBUG') || 
                        line.includes('IP:') || 
                        line.includes('User-Agent:') || 
                        line.includes('Hash:') || 
                        line.includes('Variant:')
                    );
                    debugLines.forEach(line => console.log(`   ${line.trim()}`));
                    console.log('');
                }
                
            } else {
                console.log(`   Error: ${result.error}`);
                console.log('');
            }
            
        } catch (error) {
            console.log(`   Exception: ${error.message}`);
            console.log('');
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Run the test
testProxyRequests().catch(console.error);