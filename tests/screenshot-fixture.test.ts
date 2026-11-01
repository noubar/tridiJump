// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// The capture script is JavaScript so it can run directly under Node.
// @ts-expect-error There is deliberately no runtime package declaration for release tooling.
import { demoArtworkFor, screenshotBootstrap } from '../scripts/screenshots.mjs';

describe('production screenshot automation', () => {
  it('uses ordinary production builds instead of a screenshot-only Vite mode', () => {
    const script = readFileSync(new URL('../scripts/screenshots.mjs', import.meta.url), 'utf8');
    const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

    expect(script).toContain("vite, 'build'");
    expect(script).toContain("screenshotBuildMode: 'ordinary-production-build'");
    expect(script).not.toMatch(/screenshots-chrome|screenshots-firefox|dist-screenshots/);
    expect(vite).not.toMatch(/screenshotBuild|screenshots-chrome|screenshots-firefox|dist-screenshots/);
  });

  it('discovers the current provider list from the rendered Settings page', () => {
    const bootstrap = screenshotBootstrap('settings', 'fake-capture-token');

    expect(bootstrap).toContain("querySelectorAll('#repository-availability li')");
    expect(bootstrap).toContain("id.replace(/^repository-/");
    expect(bootstrap).not.toMatch(/providerId:\s*['"](?:makerworld|myminifactory|thingiverse|cults3d)['"]/i);
    expect(bootstrap).not.toMatch(/api.?key|authorization|bearer|password/i);
  });

  it('discovers result repositories and selects provider artwork with a neutral fallback', () => {
    const bootstrap = screenshotBootstrap('results', 'fake-capture-token', [
      { id: 'future-disabled', name: 'Future Disabled', mode: 'direct-search', enabled: false },
    ]);

    expect(bootstrap).toContain('future-disabled');
    expect(bootstrap).toContain('new Map(capturedProviders.map');
    expect(bootstrap).toContain("querySelectorAll('#repository-options label, #disabled-repository-options label')");
    expect(bootstrap).toContain("querySelectorAll('#native-searches a[data-provider-id]')");
    expect(bootstrap).toContain('artworkByKey[normalizedKey(provider.id)]');
    expect(demoArtworkFor({ id: 'printables', name: 'Printables' })).toBe('Demo-Printables.png');
    expect(demoArtworkFor({ id: 'sketchfab', name: 'Sketchfab' })).toBe('Demo-Sketchfab.png');
    expect(demoArtworkFor({ id: 'brand-new-provider', name: 'Brand New Provider' })).toBe('Demo-Neutral-Benchys.png');
  });

  it('uses transient local extension state and blocks remote screenshot traffic', () => {
    const bootstrap = screenshotBootstrap('results', 'fake-capture-token');

    expect(bootstrap).toContain('Screenshot capture blocks remote network requests.');
    expect(bootstrap).toContain("url.origin === location.origin");
    expect(bootstrap).not.toContain('localStorage');
  });
});
