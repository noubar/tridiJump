// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('public/manifest.json', root), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

describe('extension foundation', () => {
  it('uses Manifest V3 and the package release version', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('requests no permissions or background execution', () => {
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions ?? []).toEqual([]);
    expect(manifest.background).toBeUndefined();
    expect(manifest.content_scripts ?? []).toEqual([]);
    expect(manifest.content_security_policy.extension_pages)
      .toBe("script-src 'self'; object-src 'self'");
  });

  it('wires the toolbar and options menu to existing pages', () => {
    for (const page of [manifest.action.default_popup, manifest.options_ui.page]) {
      expect(existsSync(new URL(page, root))).toBe(true);
    }
    expect(manifest.options_ui.open_in_tab).toBe(true);
  });

  it('submits popup searches through a local GET form in a separate tab', () => {
    const html = readFileSync(new URL(manifest.action.default_popup, root), 'utf8');
    const form = html.match(/<form\b[^>]+>/)![0];
    expect(form).toContain('action="../results/index.html"');
    expect(form).toContain('method="get"');
    expect(form).toContain('target="_blank"');
    expect(form).toContain('rel="noopener"');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="expanded"');
  });

  it('links all pages to real local destinations and TypeScript entries', () => {
    for (const name of ['popup', 'results', 'settings']) {
      const page = new URL(`src/${name}/index.html`, root);
      const html = readFileSync(page, 'utf8');
      expect(html).toContain('src="./main.ts"');
      expect(existsSync(new URL('./main.ts', page))).toBe(true);
      const links = [...html.matchAll(/href="([^"]+)"/g)];
      expect(links.length).toBeGreaterThan(0);
      for (const [, href] of links) {
        const destination = new URL(href!, page);
        expect(destination.protocol).toBe('file:');
        expect(existsSync(destination)).toBe(true);
      }
    }
  });
});
