#!/usr/bin/env node

/**
 * Quick header debugging test
 * Tests what headers are actually being sent by the worker
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load credentials
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
    console.log('⚠️  .env file not found');
    process.exit(1);
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

function makeProxyRequest(proxyHost, proxyPort) {
    return new Promise((resolve) => {
        if (!env.SQUID_PROXY_USERNAME || !env.SQUID_PROXY_PASSWORD) {
            resolve({ success: false, error: 'Proxy credentials not available' });
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
            timeout: 15000
        };

        const connectReq = http.request(connectOptions);
        
        connectReq.on('connect', (res, socket, head) => {
            if (res.statusCode !== 200) {
                resolve({ success: false, error: `CONNECT failed: ${res.statusCode}` });
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
                timeout: 15000
            };

            const httpsReq = https.request(httpsOptions, (res) => {
                let body = '';
                
                res.on('data', (chunk) => {
                    body += chunk;
                });
                
                res.on('end', () => {
                    // Extract all headers that start with x-
                    const abHeaders = {};
                    Object.keys(res.headers).forEach(key => {
                        if (key.toLowerCase().startsWith('x-')) {
                            abHeaders[key] = res.headers[key];
                        }
                    });
                    
                    // Look for meta tags in HTML
                    const metaVariantMatch = body.match(/<meta name="cf-ab-variant" content="([^"]+)"/);
                    const metaTestMatch = body.match(/<meta name="cf-ab-test" content="([^"]+)"/);
                    
                    // Look for debug comments
                    const debugMatch = body.match(/<!-- CF-AB-DEBUG: (.*?) -->/);
                    const debugFailMatch = body.match(/<!-- CF-AB-DEBUG-FAIL: (.*?) -->/);
                    const debugBufferMatch = body.match(/<!-- CF-AB-BUFFER-DEBUG: (.*?) -->/);
                    
                    resolve({
                        success: true,
                        proxy: `${proxyHost}:${proxyPort}`,
                        allHeaders: res.headers,
                        abHeaders,
                        metaVariant: metaVariantMatch ? metaVariantMatch[1] : null,
                        metaTest: metaTestMatch ? metaTestMatch[1] : null,
                        debugInfo: debugMatch ? debugMatch[1] : null,
                        debugFailInfo: debugFailMatch ? debugFailMatch[1] : null,
                        debugBufferInfo: debugBufferMatch ? debugBufferMatch[1] : null,
                        statusCode: res.statusCode,
                        contentLength: body.length
                    });
                });
            });

            httpsReq.on('error', () => {
                resolve({ success: false, error: 'HTTPS request failed' });
            });

            httpsReq.on('timeout', () => {
                httpsReq.destroy();
                resolve({ success: false, error: 'HTTPS request timeout' });
            });

            httpsReq.end();
        });

        connectReq.on('error', () => {
            resolve({ success: false, error: 'CONNECT request failed' });
        });

        connectReq.on('timeout', () => {
            connectReq.destroy();
            resolve({ success: false, error: 'CONNECT timeout' });
        });

        connectReq.end();
    });
}

async function debugHeaders() {
    console.log('🔍 Debugging A/B Testing Headers');
    console.log('=================================');
    console.log('Testing first 3 proxies to see actual headers received...');
    console.log('');
    
    const testProxies = [
        '23.19.98.55:8800',
        '23.19.98.180:8800', 
        '173.234.232.213:8800'
    ];
    
    for (const proxy of testProxies) {
        const [host, port] = proxy.split(':');
        console.log(`Testing ${proxy}:`);
        
        const result = await makeProxyRequest(host, parseInt(port));
        
        if (result.success) {
            console.log(`  Status: ${result.statusCode}`);
            console.log(`  A/B Headers:`, JSON.stringify(result.abHeaders, null, 4));
            console.log(`  Meta Variant: ${result.metaVariant || 'Not found'}`);
            console.log(`  Meta Test: ${result.metaTest || 'Not found'}`);
            console.log(`  Debug Info: ${result.debugInfo || 'None'}`);
            console.log(`  Debug Fail Info: ${result.debugFailInfo || 'None'}`);
            console.log(`  Debug Buffer Info: ${result.debugBufferInfo || 'None'}`);
            console.log(`  Content Size: ${(result.contentLength/1000).toFixed(1)}kb`);
        } else {
            console.log(`  ❌ ${result.error}`);
        }
        
        console.log('');
        
        // Short delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

debugHeaders().catch(console.error);