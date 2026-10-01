import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const staticFiles = ['app.js', 'cloud-sync.js', 'manifest.json', 'service-worker.js', 'icons/tytan.svg', 'icons/tytan-192.png', 'icons/tytan-512.png', 'icons/tytan-logo.png', 'icons/tytan-logo-invoice.png', 'icons/durian-logo.png', 'icons/greenply-logo.png', 'icons/greenply-logo-invoice.png', 'icons/centuryply-logo.png', 'icons/centuryply-logo-invoice.png'];

export default defineConfig({
  plugins: [{
    name: 'copy-static-app-files',
    generateBundle() {
      for (const fileName of staticFiles) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(fileName) });
      }
    }
  }]
});
