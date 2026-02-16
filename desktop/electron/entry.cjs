const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mainModulePath = path.join(__dirname, '..', 'dist-electron', 'main.js');

function boot() {
  if (!fs.existsSync(mainModulePath)) {
    setTimeout(boot, 100);
    return;
  }

  import(pathToFileURL(mainModulePath).href).catch((error) => {
    console.error('Failed to load Electron main module:', error);
    process.exit(1);
  });
}

boot();
