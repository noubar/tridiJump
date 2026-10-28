// SPDX-License-Identifier: GPL-3.0-or-later
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'package-license',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'LICENSE', source: readFileSync(new URL('./LICENSE', import.meta.url), 'utf8') });
      this.emitFile({ type: 'asset', fileName: 'SOURCE.txt', source:
        'tridiJump\nCopyright (C) 2026 tridiJump contributors\nSPDX-License-Identifier: GPL-3.0-or-later\n'
        + 'Source repository: https://github.com/noubar/tridiJump\n'
        + 'Release distributors must provide the complete corresponding source for the exact build, including modifications.\n' });
    },
  }],
  build: {
    // Keep bundled thumbnails as files; the renderer rejects untrusted data URLs.
    assetsInlineLimit: 0,
    target: 'es2022',
    rolldownOptions: {
      input: {
        background: fileURLToPath(new URL('./src/background.ts', import.meta.url)),
        popup: fileURLToPath(new URL('./src/popup/index.html', import.meta.url)),
        results: fileURLToPath(new URL('./src/results/index.html', import.meta.url)),
        settings: fileURLToPath(new URL('./src/settings/index.html', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
