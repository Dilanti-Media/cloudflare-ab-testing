#!/usr/bin/env node

/**
 * Debug script to test the hash algorithm specifically with proxy IPs
 * This will help us understand why all proxies are returning variant A
 */

// Simulate the generateVariant function from the worker
function generateVariant(ip, userAgent, cfRay = '') {
  // Hash components individually to avoid string concatenation
  let hash = 0;
  
  // Hash IP address
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
  }
  
  // Hash first 50 chars of user agent for performance
  const ua = userAgent.substring(0, 50);
  for (let i = 0; i < ua.length; i++) {
    hash = ((hash << 5) - hash) + ua.charCodeAt(i);
  }
  
  // Hash CF-Ray for additional entropy
  for (let i = 0; i < cfRay.length; i++) {
    hash = ((hash << 5) - hash) + cfRay.charCodeAt(i);
  }
  
  // Convert to 32-bit integer and use modulo for 50/50 split
  hash = hash & 0x7fffffff; // Ensure positive 32-bit integer
  return (hash % 2) === 0 ? 'A' : 'B';
}

// Test with proxy IPs
const PROXY_IPS = [
  '23.19.98.55',
  '23.19.98.180',
  '173.234.232.213',
  '23.19.98.82',
  '23.19.98.57',
  '173.234.232.82',
  '173.232.127.234',
  '173.234.194.122',
  '173.234.194.169',
  '173.232.127.166'
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
];

console.log('🔍 Hash Algorithm Debug - Proxy IP Analysis');
console.log('===========================================');
console.log('');

console.log('📊 Testing each proxy IP with different user agents:');
console.log('');

let totalA = 0;
let totalB = 0;
let results = [];

for (const ip of PROXY_IPS) {
  console.log(`IP: ${ip}`);
  
  let ipResults = { A: 0, B: 0 };
  
  for (let i = 0; i < USER_AGENTS.length; i++) {
    const userAgent = USER_AGENTS[i];
    const cfRay = `test${i}-SJC`;
    
    const variant = generateVariant(ip, userAgent, cfRay);
    ipResults[variant]++;
    
    // Show first few results for this IP
    if (i < 3) {
      console.log(`   UA ${i+1}: ${variant} (${userAgent.substring(0, 50)}...)`);
    }
  }
  
  totalA += ipResults.A;
  totalB += ipResults.B;
  
  const percentA = (ipResults.A / USER_AGENTS.length * 100).toFixed(1);
  const percentB = (ipResults.B / USER_AGENTS.length * 100).toFixed(1);
  
  console.log(`   Summary: ${ipResults.A} A (${percentA}%), ${ipResults.B} B (${percentB}%)`);
  console.log('');
  
  results.push({
    ip: ip,
    A: ipResults.A,
    B: ipResults.B,
    percentA: percentA,
    percentB: percentB
  });
}

console.log('📈 Overall Results:');
console.log(`Total A: ${totalA}, Total B: ${totalB}`);
console.log(`Distribution: ${(totalA / (totalA + totalB) * 100).toFixed(1)}% A, ${(totalB / (totalA + totalB) * 100).toFixed(1)}% B`);
console.log('');

console.log('🔍 Detailed Analysis:');
console.log('IP Address         | A  | B  | A%    | B%    | Consistent?');
console.log('-------------------|----|----|-------|-------|------------');

for (const result of results) {
  const consistent = result.A === USER_AGENTS.length || result.B === USER_AGENTS.length;
  console.log(`${result.ip.padEnd(18)} | ${result.A.toString().padStart(2)} | ${result.B.toString().padStart(2)} | ${(result.percentA + '%').padStart(5)} | ${(result.percentB + '%').padStart(5)} | ${consistent ? '✅ YES' : '❌ NO'}`);
}

console.log('');
console.log('🎯 Key Insights:');
console.log('   • IP-based hashing should be consistent per IP');
console.log('   • Different user agents should not change the result much');
console.log('   • If all IPs show the same variant, there might be a bias in the IP range');
console.log('');

// Test with a broader range of IPs to see the distribution
console.log('🌐 Testing with broader IP range for comparison:');
console.log('');

const testIps = [];
for (let i = 0; i < 20; i++) {
  // Generate more diverse IPs
  const ip = `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
  testIps.push(ip);
}

let diverseA = 0;
let diverseB = 0;

for (const ip of testIps) {
  const variant = generateVariant(ip, USER_AGENTS[0], 'test-SJC');
  if (variant === 'A') diverseA++;
  else diverseB++;
}

console.log(`Diverse IP test: ${diverseA} A (${(diverseA / testIps.length * 100).toFixed(1)}%), ${diverseB} B (${(diverseB / testIps.length * 100).toFixed(1)}%)`);
console.log('');

console.log('💡 Recommendations:');
console.log('   1. The hash algorithm appears to have bias for specific IP ranges');
console.log('   2. Consider using a more robust hash function (like SHA256)');
console.log('   3. Add salt to the hash to improve distribution');
console.log('   4. Test with IPs from different geographic regions');