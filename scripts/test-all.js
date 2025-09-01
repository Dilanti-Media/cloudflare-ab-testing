#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env from repo root if present
const rootEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv });
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  return res.status === 0;
}

console.log('=== Running full test suite (unit + proxy e2e) ===');

let unitOk = true;
let proxyOk = true;

console.log('\n> Unit & integration (Jest)');
unitOk = run('npm', ['run', '-s', 'test']);

console.log(`Unit/Integration: ${unitOk ? 'PASS' : 'FAIL'}`);

console.log('\n> Proxy E2E (A/B split, cache, security, GA4)');
proxyOk = run('npm', ['run', '-s', 'test:proxy:all']);
console.log(`Proxy E2E: ${proxyOk ? 'PASS' : 'FAIL'}`);

const strict = String(process.env.PROXY_STRICT || '').toLowerCase() === 'true';
const overallOk = unitOk && (proxyOk || !strict);

console.log(`\n=== Summary ===`);
console.log(`Unit/Integration: ${unitOk ? 'PASS' : 'FAIL'}`);
console.log(`Proxy E2E:       ${proxyOk ? 'PASS' : 'FAIL'}${strict ? ' (strict)' : ' (non-strict)'}`);
console.log(`Overall:         ${overallOk ? 'PASS' : 'FAIL'}`);

process.exit(overallOk ? 0 : 1);
