#!/usr/bin/env node

/**
 * Test if WordPress is executing our plugin code at all
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

            const httpsOptions = {
                hostname: 'cloudflare-ab-testing.dilanti.media',
                port: 443,
                path: '/',
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
                    // Check for plugin-related content
                    const hasPluginJS = body.includes('cloudflare-ab-testing.js');
                    const hasPluginCSS = body.includes('cloudflare-ab-testing');
                    const hasAbButton = body.includes('btn-ab');
                    const hasMetaTags = body.includes('cf-ab-variant');
                    const hasWpHead = body.includes('<head');
                    const hasWpFooter = body.includes('wp-footer') || body.includes('</body>');
                    const hasPluginVersion = body.includes('2.1.7') || body.includes('2.1.6') || body.includes('2.1.5');
                    
                    // Look for any plugin indicators
                    const pluginIndicators = [];
                    if (body.includes('cloudflare-ab-testing')) pluginIndicators.push('plugin-name-found');
                    if (body.includes('ab-cta-button')) pluginIndicators.push('plugin-css-found');
                    if (body.includes('cloudflareAbTesting')) pluginIndicators.push('js-config-found');
                    if (body.includes('AB_HOMEPAGE_TEST')) pluginIndicators.push('test-config-found');
                    
                    // Extract first 1000 chars of head section for analysis
                    const headMatch = body.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
                    const headContent = headMatch ? headMatch[1].substring(0, 1000) : 'HEAD NOT FOUND';
                    
                    resolve({
                        success: true,
                        proxy: `${proxyHost}:${proxyPort}`,
                        hasPluginJS,
                        hasPluginCSS,
                        hasAbButton,
                        hasMetaTags,
                        hasWpHead,
                        hasWpFooter,
                        hasPluginVersion,
                        pluginIndicators,
                        headContent,
                        statusCode: res.statusCode,
                        contentLength: body.length,
                        headers: res.headers
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

async function testWordPressExecution() {
    console.log('🔍 Testing WordPress Plugin Execution');
    console.log('====================================');
    console.log('Checking if WordPress is executing our plugin code...');
    console.log('');
    
    const [host, port] = '23.19.98.55:8800'.split(':');
    const result = await makeProxyRequest(host, parseInt(port));
    
    if (result.success) {
        console.log(`Status: ${result.statusCode}`);
        console.log('');
        
        console.log('Plugin Execution Indicators:');
        console.log(`  Plugin JS Loaded: ${result.hasPluginJS ? '✅' : '❌'}`);
        console.log(`  Plugin CSS Present: ${result.hasPluginCSS ? '✅' : '❌'}`);
        console.log(`  A/B Button Present: ${result.hasAbButton ? '✅' : '❌'}`);
        console.log(`  Meta Tags Injected: ${result.hasMetaTags ? '✅' : '❌'}`);
        console.log(`  WordPress Head: ${result.hasWpHead ? '✅' : '❌'}`);
        console.log(`  WordPress Footer: ${result.hasWpFooter ? '✅' : '❌'}`);
        console.log(`  Plugin Version: ${result.hasPluginVersion ? '✅' : '❌'}`);
        console.log('');
        
        console.log('Plugin Indicators Found:');
        if (result.pluginIndicators.length > 0) {
            result.pluginIndicators.forEach(indicator => {
                console.log(`  ✅ ${indicator}`);
            });
        } else {
            console.log('  ❌ No plugin indicators found');
        }
        console.log('');
        
        console.log('Worker Headers:');
        Object.keys(result.headers).forEach(key => {
            if (key.toLowerCase().startsWith('x-')) {
                console.log(`  ${key}: ${result.headers[key]}`);
            }
        });
        console.log('');
        
        console.log('HEAD Section Sample:');
        console.log('-------------------');
        console.log(result.headContent);
        console.log('-------------------');
        
    } else {
        console.log(`❌ ${result.error}`);
    }
}

testWordPressExecution().catch(console.error);