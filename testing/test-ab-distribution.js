#!/usr/bin/env node

/**
 * Test script to verify 50/50 A/B test distribution
 * 
 * This script simulates the variant assignment logic from the Cloudflare worker
 * and tests it with various IP addresses and user agents to verify the distribution.
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

// Generate realistic test data
function generateTestData(count = 10000) {
  const data = [];
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59'
  ];
  
  for (let i = 0; i < count; i++) {
    // Generate random IP address
    const ip = `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    
    // Pick random user agent
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // Generate random CF-Ray (optional)
    const cfRay = Math.random() < 0.8 ? `${Math.random().toString(36).substr(2, 16)}-SJC` : '';
    
    data.push({ ip, userAgent, cfRay });
  }
  
  return data;
}

// Test distribution
function testDistribution(testData) {
  console.log(`🧪 Testing A/B variant distribution with ${testData.length} samples...\n`);
  
  const variants = { A: 0, B: 0 };
  const results = [];
  
  for (const { ip, userAgent, cfRay } of testData) {
    const variant = generateVariant(ip, userAgent, cfRay);
    variants[variant]++;
    
    // Store first 10 results for display
    if (results.length < 10) {
      results.push({ ip, userAgent: userAgent.substring(0, 50), variant, cfRay });
    }
  }
  
  // Calculate percentages
  const totalTests = variants.A + variants.B;
  const percentA = (variants.A / totalTests * 100).toFixed(2);
  const percentB = (variants.B / totalTests * 100).toFixed(2);
  
  console.log('📊 Results:');
  console.log(`   Variant A: ${variants.A} (${percentA}%)`);
  console.log(`   Variant B: ${variants.B} (${percentB}%)`);
  console.log(`   Total: ${totalTests}\n`);
  
  // Show first 10 results
  console.log('🔍 Sample Results:');
  results.forEach((result, i) => {
    console.log(`   ${i + 1}. IP: ${result.ip.padEnd(15)} | UA: ${result.userAgent.padEnd(50)} | Variant: ${result.variant} | CF-Ray: ${result.cfRay}`);
  });
  
  // Check if distribution is within acceptable range (45-55%)
  const isBalanced = percentA >= 45 && percentA <= 55 && percentB >= 45 && percentB <= 55;
  
  console.log(`\n✅ Distribution Analysis:`);
  console.log(`   Expected: ~50% A, ~50% B`);
  console.log(`   Actual: ${percentA}% A, ${percentB}% B`);
  console.log(`   Balanced: ${isBalanced ? '✅ YES' : '❌ NO'}`);
  
  if (!isBalanced) {
    console.log(`   ⚠️  Distribution is outside acceptable range (45-55%)`);
  }
  
  return { variants, percentA, percentB, isBalanced };
}

// Test with different sample sizes
function runTests() {
  console.log('🚀 A/B Testing Distribution Verification\n');
  console.log('This script tests the hash-based variant assignment logic');
  console.log('used in the Cloudflare worker to ensure proper 50/50 distribution.\n');
  
  const testSizes = [1000, 5000, 10000, 50000];
  
  for (const size of testSizes) {
    console.log(`${'='.repeat(80)}`);
    console.log(`TEST ${size.toLocaleString()} SAMPLES`);
    console.log(`${'='.repeat(80)}`);
    
    const testData = generateTestData(size);
    const results = testDistribution(testData);
    
    console.log('\n');
  }
  
  console.log('💡 Tips for manual testing:');
  console.log('   1. Use different browsers/devices to get different user agents');
  console.log('   2. Use VPN or different networks to get different IP addresses');
  console.log('   3. Check browser console for debug output on your test site');
  console.log('   4. Use URL parameters like ?AB_HOMEPAGE_TEST=B to force variants');
  console.log('   5. Clear cookies between tests to get fresh assignments');
}

// Run the tests
runTests();