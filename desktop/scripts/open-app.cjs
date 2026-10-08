#!/usr/bin/env node
/**
 * open-app.cjs  –  Developer helper for running the locally-built
 * Electron app on macOS without an Apple Developer certificate.
 *
 * This script:
 *   1. Strips the com.apple.quarantine xattr that is set when files are
 *      downloaded or copied from another volume.
 *   2. Launches the app with `open`.
 * (electron-builder already ad-hoc signs the bundle, so no re-sign here.)
 *
 * Usage:
 *   node scripts/open-app.cjs
 *   npm run open-app
 */

const { execSync, spawnSync } = require('child_process');
const path = require('node:path');
const fs   = require('node:fs');

const APP_PATH        = path.resolve(__dirname, '../release/mac-universal/Inventory App.app');

if (!fs.existsSync(APP_PATH)) {
  console.error(`❌  App not found at: ${APP_PATH}`);
  console.error('   Run  npm run build  first.');
  process.exit(1);
}

console.log('🧹  Removing quarantine attributes (app is already ad-hoc signed by electron-builder)…');
try {
  execSync(`xattr -rc "${APP_PATH}"`, { stdio: 'inherit' });
  console.log('✅  Quarantine cleared');
} catch {
  // Non-fatal – quarantine may not be present
  console.log('ℹ️   No quarantine attribute found');
}

// NOTE: Do NOT re-sign with `codesign --deep` here.
// --deep re-signs the Electron Framework with a mismatched signature and
// causes a DYLD crash at launch ("different Team IDs") on macOS 15/26.
// electron-builder already ad-hoc signs the bundle with
// build/entitlements.mac.plist (which includes disable-library-validation).

console.log('🚀  Launching Inventory App…');
const result = spawnSync('open', [APP_PATH], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('❌  Failed to open app');
  process.exit(1);
}
console.log('✅  App launched!');
