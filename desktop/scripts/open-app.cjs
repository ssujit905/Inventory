#!/usr/bin/env node
/**
 * open-app.cjs  –  Developer helper for running the locally-built
 * Electron app on macOS without an Apple Developer certificate.
 *
 * macOS 15+ (Sequoia) and macOS 26 (Tahoe) fully block ad-hoc-signed
 * apps via Gatekeeper even after quarantine removal.  This script:
 *   1. Re-signs every binary in the .app bundle with the local ad-hoc
 *      identity (‑ ) and the project's own entitlements.
 *   2. Strips the com.apple.quarantine xattr that is set when files are
 *      downloaded or copied from another volume.
 *   3. Launches the app with `open`.
 *
 * Usage:
 *   node scripts/open-app.cjs
 *   npm run open-app
 */

const { execSync, spawnSync } = require('child_process');
const path = require('node:path');
const fs   = require('node:fs');

const APP_PATH        = path.resolve(__dirname, '../release/mac-universal/Inventory App.app');
const ENTITLEMENTS    = path.resolve(__dirname, '../build/entitlements.mac.plist');

if (!fs.existsSync(APP_PATH)) {
  console.error(`❌  App not found at: ${APP_PATH}`);
  console.error('   Run  npm run build  first.');
  process.exit(1);
}

console.log('🔐  Re-signing app bundle with ad-hoc identity…');
try {
  execSync(
    `codesign --force --deep --sign - --entitlements "${ENTITLEMENTS}" "${APP_PATH}"`,
    { stdio: 'inherit' }
  );
  console.log('✅  Code-signed OK');
} catch {
  console.error('❌  codesign failed');
  process.exit(1);
}

console.log('🧹  Removing quarantine attributes…');
try {
  execSync(`xattr -rc "${APP_PATH}"`, { stdio: 'inherit' });
  console.log('✅  Quarantine cleared');
} catch {
  // Non-fatal – quarantine may not be present
  console.log('ℹ️   No quarantine attribute found');
}

console.log('🚀  Launching Inventory App…');
const result = spawnSync('open', [APP_PATH], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('❌  Failed to open app');
  process.exit(1);
}
console.log('✅  App launched!');
