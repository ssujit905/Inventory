import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainModulePath = path.join(__dirname, '..', 'dist-electron', 'main.js');

function boot() {
  if (!fs.existsSync(mainModulePath)) {
    setTimeout(boot, 100);
    return;
  }

  import(pathToFileURL(mainModulePath).href).catch((error) => {
    console.error('Main Process Load Error:', error);
    process.exit(1);
  });
}

boot();
