// SPDX-License-Identifier: GPL-3.0-or-later
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // Keep bundled thumbnails as files; the renderer rejects untrusted data URLs.
    assetsInlineLimit: 0,
    target: 'es2022',
    rolldownOptions: {
      input: {
        popup: fileURLToPath(new URL('./src/popup/index.html', import.meta.url)),
        results: fileURLToPath(new URL('./src/results/index.html', import.meta.url)),
        settings: fileURLToPath(new URL('./src/settings/index.html', import.meta.url)),
      },
    },
  },
});
