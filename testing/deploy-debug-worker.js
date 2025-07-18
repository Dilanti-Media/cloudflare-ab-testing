#!/usr/bin/env node

/**
 * Deploy debug version of worker to see what's happening with proxy requests
 */

const https = require('https');
const fs = require('fs');
const FormData = require('form-data');

// Read the debug worker script
const workerScript = fs.readFileSync('/Users/kim/Documents/MyFiles/BoilerplateH/cloudflare-ab-testing/plugin/workers/ab-testing.js', 'utf8');

console.log('🔧 Deploying debug worker to investigate proxy issue...');

// Make a simple test request to trigger the worker update
const testRequest = () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'cloudflare-ab-testing.dilanti.media',
            port: 443,
            path: '/wp-admin/admin-ajax.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        };

        const postData = 'action=cloudflare_ab_update_worker_code&security=debug_test';

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log('Response:', data);
                resolve(data);
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
};

// For now, let's just copy the file and recommend manual deployment
console.log('Debug worker script is ready at:');
console.log('- plugin/workers/ab-testing.js');
console.log('- wordpress/wp-content/plugins/cloudflare-ab-testing/workers/ab-testing.js');
console.log('');
console.log('💡 To deploy:');
console.log('1. Go to WordPress admin: https://cloudflare-ab-testing.dilanti.media/wp-admin');
console.log('2. Navigate to A/B Tests > Worker Management');
console.log('3. Click "Update Worker Code"');
console.log('');
console.log('Then run the proxy test and check Cloudflare logs for debug output.');