// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifests/chrome.json', root), 'utf8'));
const firefoxManifest = JSON.parse(readFileSync(new URL('manifests/firefox.json', root), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

describe('extension foundation', () => {
  it('uses Manifest V3 and the package release version', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('grants only extension storage and the four implemented API origins', () => {
    expect(manifest.permissions ?? []).toEqual(['storage']);
    expect(manifest.host_permissions ?? []).toEqual(['https://cults3d.com/*', 'https://www.myminifactory.com/*', 'https://api.thingiverse.com/*', 'https://api.printables.com/*']);
    expect(manifest.optional_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions ?? []).toEqual([]);
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.content_scripts ?? []).toEqual([]);
    expect(manifest.content_security_policy.extension_pages)
      .toBe("script-src 'self'; object-src 'self'");
  });

  it('keeps Firefox desktop metadata explicit and permissions equivalent', () => {
    expect(firefoxManifest.manifest_version).toBe(3);
    expect(firefoxManifest.version).toBe(pkg.version);
    expect(firefoxManifest.permissions).toEqual(manifest.permissions);
    expect(firefoxManifest.host_permissions).toEqual(manifest.host_permissions);
    expect(firefoxManifest.background).toEqual({ scripts: ['background.js'], type: 'module' });
    expect(firefoxManifest.background.service_worker).toBeUndefined();
    expect(firefoxManifest.browser_specific_settings).toEqual({ gecko: {
      id: 'tridijump@noubarprogram.extension', strict_min_version: '140.0',
      data_collection_permissions: { required: ['searchTerms', 'authenticationInfo'] },
    } });
    expect(firefoxManifest.browser_specific_settings.gecko_android).toBeUndefined();
  });

  it('wires the toolbar and options menu to existing pages', () => {
    for (const page of [manifest.action.default_popup, manifest.options_ui.page]) {
      expect(existsSync(new URL(page, root))).toBe(true);
    }
    expect(manifest.options_ui.open_in_tab).toBe(true);
  });

  it('packages the supplied branding at Chromium extension icon sizes', () => {
    expect(manifest.icons).toEqual({
      16: 'icons/tridijump-16.png', 32: 'icons/tridijump-32.png',
      48: 'icons/tridijump-48.png', 128: 'icons/tridijump-128.png',
    });
    expect(manifest.action.default_icon).toEqual(manifest.icons);
    for (const icon of Object.values<string>(manifest.icons)) {
      expect(existsSync(new URL(`public/${icon}`, root)), icon).toBe(true);
    }
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
        if (destination.protocol === 'file:') expect(existsSync(destination)).toBe(true);
        else expect(['https://cults3d.com', 'https://www.myminifactory.com', 'https://www.thingiverse.com']).toContain(destination.origin);
      }
    }
  });
});
