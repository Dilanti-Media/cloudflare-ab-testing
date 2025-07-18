#!/usr/bin/env node

/**
 * Run a single debug test to see what the worker is actually seeing
 */

const http = require('http');
const fs = require('fs');

// Load credentials
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

function makeDebugRequest() {
    return new Promise((resolve) => {
        const options = {
            hostname: '23.19.98.55',
            port: 8800,
            path: 'https://cloudflare-ab-testing.dilanti.media/',
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Proxy-Authorization': `Basic ${Buffer.from(`${env.SQUID_PROXY_USERNAME}:${env.SQUID_PROXY_PASSWORD}`).toString('base64')}`,
                'Host': 'cloudflare-ab-testing.dilanti.media'
            },
            timeout: 15000
        };

        const req = http.request(options, (res) => {
            console.log('🔍 Debug Request Result:');
            console.log(`Status: ${res.statusCode}`);
            console.log(`Variant: ${res.headers['x-ab-variant'] || 'Unknown'}`);
            console.log(`Worker Active: ${res.headers['x-worker-active'] || 'No'}`);
            console.log(`CF-Ray: ${res.headers['cf-ray'] || 'No'}`);
            console.log('');
            console.log('💡 Check Cloudflare Dashboard → Workers → ab-testing → Logs');
            console.log('💡 Look for "VARIANT GENERATION DEBUG" entries');
            resolve();
        });

        req.on('error', (err) => {
            console.log(`Error: ${err.message}`);
            resolve();
        });

        req.end();
    });
}

console.log('🚀 Making debug request through proxy...');
console.log('This will generate debug logs in Cloudflare Workers dashboard');
console.log('');

makeDebugRequest();