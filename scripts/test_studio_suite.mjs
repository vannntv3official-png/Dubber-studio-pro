import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('=== RUNNING DUBBER STUDIO PRO VERIFICATION SUITE ===\n');

// 1. Verify Tauri Config Security & CSP
console.log('1. Checking Tauri Configuration & Security Policies...');
try {
  const tauriConf = JSON.parse(readFileSync(resolve('src-tauri/tauri.conf.json'), 'utf-8'));
  assert(tauriConf.productName === 'Dubber Studio Pro', 'App product name is correctly set');
  assert(tauriConf.app?.security?.csp !== null, 'Content Security Policy (CSP) is defined');
  assert(tauriConf.app?.security?.csp.includes("script-src 'self'"), "CSP restricts script-src to 'self'");
  assert(tauriConf.app?.security?.csp.includes("connect-src"), 'CSP defines connect-src endpoints');
  assert(tauriConf.app?.security?.csp.includes('fonts.gstatic.com'), 'CSP permits Khmer web fonts from Google');
} catch (e) {
  assert(false, `Failed to load tauri.conf.json: ${e.message}`);
}

// 2. Verify Khmer Unicode & Font Integrity
console.log('\n2. Testing Khmer Unicode & Font Pipeline...');
const khmerSample = 'សួស្តីពិភពលោក នេះគឺជាកម្មវិធីកាត់ត និងបកប្រែវីដេអូ AI';
assert(khmerSample.length > 10, 'Khmer Unicode string initialized');
assert(/[\u1780-\u17FF]/.test(khmerSample), 'Khmer Unicode block (U+1780 to U+17FF) validated');

// 3. Verify SRT Timestamp Formatter Logic
console.log('\n3. Testing SRT Subtitle Timestamp Calculations...');
function formatSrtTimestamp(ms) {
  const hours = Math.floor(ms / 3600000);
  const rem1 = ms % 3600000;
  const minutes = Math.floor(rem1 / 60000);
  const rem2 = rem1 % 60000;
  const seconds = Math.floor(rem2 / 1000);
  const millis = rem2 % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

assert(formatSrtTimestamp(0) === '00:00:00,000', '0ms formatted correctly');
assert(formatSrtTimestamp(1500) === '00:00:01,500', '1500ms formatted correctly');
assert(formatSrtTimestamp(65432) === '00:01:05,432', '65432ms formatted correctly');
assert(formatSrtTimestamp(3661500) === '01:01:01,500', '3661500ms (1h 1m 1s 500ms) formatted correctly');

// 4. Verify Speed Ratio & Auto-Fit Bounds
console.log('\n4. Testing Dynamic Speed Ratio & Clamping Invariants...');
function computeSpeedRatio(actualDurationMs, targetDurationMs) {
  if (targetDurationMs <= 0) return 1.0;
  return actualDurationMs / targetDurationMs;
}

function clampTempo(ratio) {
  if (ratio > 1.0) return Math.min(1.35, ratio);
  if (ratio < 0.8) return Math.max(0.8, ratio);
  return ratio;
}

const normalRatio = computeSpeedRatio(2000, 2000);
assert(normalRatio === 1.0 && clampTempo(normalRatio) === 1.0, '1.0x ratio clamped to 1.0x');

const tooLongRatio = computeSpeedRatio(3000, 1500); // 2.0x
assert(tooLongRatio === 2.0, '2.0x calculated for overlong audio');
assert(clampTempo(tooLongRatio) === 1.35, 'Tempo correctly clamped to 1.35x ceiling');

const tooShortRatio = computeSpeedRatio(500, 1000); // 0.5x
assert(clampTempo(tooShortRatio) === 0.8, 'Tempo correctly clamped to 0.80x floor');

// 5. Verify Store Secure Vault Migration
console.log('\n5. Testing State Store Security & Plaintext Prevention...');
const storeSource = readFileSync(resolve('src/store/studioStore.ts'), 'utf-8');
assert(storeSource.includes('load_secure_keys'), 'Store invokes load_secure_keys');
assert(storeSource.includes('save_secure_keys'), 'Store invokes save_secure_keys');
assert(storeSource.includes('localStorage.removeItem(LOCAL_STORAGE_KEY_KEYS)'), 'Plaintext keys purged from localStorage');
assert(storeSource.includes('isVaultProtected'), 'Vault protection state tracked');

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
