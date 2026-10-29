// SPDX-License-Identifier: GPL-3.0-or-later
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';

function browserManifest(path: URL): Plugin {
  return {
    name: 'browser-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: readFileSync(path, 'utf8') });
    },
  };
}

export default defineConfig(({ mode }) => {
  const screenshotBuild = mode.startsWith('screenshots-');
  return {
  base: './',
  plugins: [
  ...(screenshotBuild ? [{
    name: 'screenshot-network-isolation',
    transformIndexHtml: {
      order: 'pre' as const,
      handler: (html: string, context: { path: string }) => {
        const page = ['popup', 'results', 'settings'].find((value) => context.path.endsWith(`/src/${value}/index.html`));
        if (!page) return html;
        const tags: HtmlTagDescriptor[] = [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'",
          },
          injectTo: 'head-prepend' as const,
        }];
        if (page === 'results') {
          for (const file of ['Printables', 'Thingiverse', 'MyMiniFactory', 'Cults3D', 'MakerWorld', 'Thangs']) {
            tags.push({
              tag: 'img',
              attrs: { src: `../../assets/demo/screenshots/Demo-${file}.png`, hidden: true, alt: '' },
              injectTo: 'body-prepend' as const,
            });
          }
        }
        return { html: html.replace('src="./main.ts"', `src="../screenshots/${page}-entry.ts"`), tags };
      },
    },
  }] : [browserManifest(new URL(`./manifests/${mode === 'firefox' ? 'firefox' : 'chrome'}.json`, import.meta.url))]), {
    name: 'package-license',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'LICENSE', source: readFileSync(new URL('./LICENSE', import.meta.url), 'utf8') });
      for (const file of ['THIRD_PARTY_NOTICES.md', 'licenses/Open-English-WordNet-CC-BY-4.0.txt',
        'licenses/Princeton-WordNet-License.txt', 'licenses/Ding-GPL-2.0-or-later.txt']) {
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(new URL(`./${file}`, import.meta.url), 'utf8') });
      }
      this.emitFile({ type: 'asset', fileName: 'SOURCE.txt', source:
        'tridiJump\nCopyright (C) 2026 tridiJump contributors\nSPDX-License-Identifier: GPL-3.0-or-later\n'
        + 'Source repository: https://github.com/noubar/tridiJump\n'
        + 'Lexical source archives and deterministic converters are included in the source repository.\n'
        + 'Release distributors must provide the complete corresponding source for the exact build, including modifications.\n' });
    },
  }],
  build: {
    outDir: mode === 'screenshots-chrome' ? 'dist-screenshots/chrome'
      : mode === 'screenshots-firefox' ? 'dist-screenshots/firefox'
        : mode === 'firefox' ? 'dist-firefox' : 'dist',
    // Keep bundled thumbnails as files; the renderer rejects untrusted data URLs.
    assetsInlineLimit: 0,
    target: 'es2022',
    rolldownOptions: {
      input: {
        ...(screenshotBuild ? {} : { background: fileURLToPath(new URL('./src/background.ts', import.meta.url)) }),
        popup: fileURLToPath(new URL('./src/popup/index.html', import.meta.url)),
        results: fileURLToPath(new URL('./src/results/index.html', import.meta.url)),
        settings: fileURLToPath(new URL('./src/settings/index.html', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  };
});
