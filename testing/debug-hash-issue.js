#!/usr/bin/env node

/**
 * Debug the hash algorithm to understand why all proxy IPs return variant A
 */

// Simulate the exact hash function from the worker
function simulateWorkerHash(ip, userAgent, cfRay = '') {
    console.log(`\n🔍 Debug hash for IP: ${ip}, UA: ${userAgent.substring(0, 30)}..., CF-Ray: ${cfRay}`);
    
    let hash = 0;
    
    // Hash IP address
    console.log(`  IP input: "${ip}"`);
    for (let i = 0; i < ip.length; i++) {
        const charCode = ip.charCodeAt(i);
        hash = ((hash << 5) - hash) + charCode;
        console.log(`    [${i}] '${ip[i]}' (${charCode}) -> hash: ${hash}`);
    }
    console.log(`  After IP hash: ${hash}`);
    
    // Hash first 50 chars of user agent
    const ua = userAgent.substring(0, 50);
    console.log(`  UA input: "${ua}"`);
    for (let i = 0; i < ua.length; i++) {
        const charCode = ua.charCodeAt(i);
        hash = ((hash << 5) - hash) + charCode;
        if (i < 5) { // Only show first few for brevity
            console.log(`    [${i}] '${ua[i]}' (${charCode}) -> hash: ${hash}`);
        }
    }
    console.log(`  After UA hash: ${hash}`);
    
    // Hash CF-Ray
    if (cfRay) {
        console.log(`  CF-Ray input: "${cfRay}"`);
        for (let i = 0; i < cfRay.length; i++) {
            const charCode = cfRay.charCodeAt(i);
            hash = ((hash << 5) - hash) + charCode;
        }
        console.log(`  After CF-Ray hash: ${hash}`);
    }
    
    // Convert to 32-bit integer and use modulo for 50/50 split
    hash = hash & 0x7fffffff; // Ensure positive 32-bit integer
    const variant = (hash % 2) === 0 ? 'A' : 'B';
    
    console.log(`  Final hash: ${hash}`);
    console.log(`  Hash % 2: ${hash % 2}`);
    console.log(`  Variant: ${variant}`);
    
    return variant;
}

// Test with proxy IPs and the exact user agents we're using
const PROXY_IPS = [
    '23.19.98.55',
    '23.19.98.180',
    '173.234.232.213',
    '23.19.98.82',
    '23.19.98.57'
];

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
];

console.log('🧪 Hash Algorithm Debug - Proxy IP Analysis');
console.log('===========================================');

// Test all combinations
let totalA = 0, totalB = 0;
const results = [];

for (const ip of PROXY_IPS) {
    console.log(`\n📍 Testing IP: ${ip}`);
    console.log('='.repeat(40));
    
    for (let i = 0; i < USER_AGENTS.length; i++) {
        const userAgent = USER_AGENTS[i];
        const cfRay = `test${i}-SJC`;
        
        const variant = simulateWorkerHash(ip, userAgent, cfRay);
        
        if (variant === 'A') totalA++;
        else totalB++;
        
        results.push({
            ip: ip,
            userAgent: userAgent.substring(0, 50),
            cfRay: cfRay,
            variant: variant
        });
    }
}

console.log('\n📊 Summary Results:');
console.log('==================');
console.log(`Total A: ${totalA}`);
console.log(`Total B: ${totalB}`);
console.log(`Distribution: ${(totalA / (totalA + totalB) * 100).toFixed(1)}% A, ${(totalB / (totalA + totalB) * 100).toFixed(1)}% B`);

console.log('\n🔍 All Results:');
console.log('IP               | User Agent                                     | CF-Ray      | Variant');
console.log('-----------------|-----------------------------------------------|-------------|--------');
results.forEach(r => {
    console.log(`${r.ip.padEnd(16)} | ${r.userAgent.padEnd(45)} | ${r.cfRay.padEnd(11)} | ${r.variant}`);
});

// Test if it's a specific issue with the hash function
console.log('\n🔬 Testing hash function edge cases:');
console.log('=====================================');

// Test with minimal inputs
console.log('\n1. Testing with very simple inputs:');
simulateWorkerHash('1.1.1.1', 'A', '');
simulateWorkerHash('2.2.2.2', 'B', '');

// Test with empty values
console.log('\n2. Testing with empty values:');
simulateWorkerHash('', '', '');
simulateWorkerHash('127.0.0.1', '', '');

// Test the exact values we might be getting from proxy
console.log('\n3. Testing suspected proxy values:');
simulateWorkerHash('23.19.98.55', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', '');

console.log('\n💡 Analysis:');
console.log('1. Check if all hashes are landing on even numbers (variant A)');
console.log('2. Look for patterns in the hash values');
console.log('3. Verify the modulo operation is working correctly');
console.log('4. Consider if there\'s overflow in the hash calculation');