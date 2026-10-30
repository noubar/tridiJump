// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  compareAllowlist,
  containsScreenshotTooling,
  createDeterministicZip,
  detectSecretCategories,
  forbiddenPackagePath,
  isChromeVersion,
  isSafePackagePath,
  readZipEntries,
  sha256,
  validateManifest,
} from '../scripts/release-helpers.mjs';

describe('release helpers', () => {
  it('validates Chrome versions and their component limits', () => {
    expect(isChromeVersion('1.0.0')).toBe(true);
    expect(isChromeVersion('2.4.1.9')).toBe(true);
    expect(isChromeVersion('1.0.0-beta')).toBe(false);
    expect(isChromeVersion('1.00.0')).toBe(false);
    expect(isChromeVersion('1.65536.0')).toBe(false);
  });

  it('validates the manifest and exact allowlists', () => {
    const manifest = { manifest_version: 3, version: '1.2.3', name: 'tridiJump', description: 'Search', permissions: ['storage'], host_permissions: [] };
    expect(validateManifest(manifest, '1.2.3')).toEqual([]);
    expect(validateManifest({ ...manifest, version: '1.2.4' }, '1.2.3')).toContain('manifest version must be 1.2.3');
    expect(compareAllowlist(['storage'], ['storage'], 'permission')).toEqual([]);
    expect(compareAllowlist(['storage', 'tabs'], ['storage'], 'permission')).toContain('Unexpected permission: tabs');
  });

  it('identifies forbidden files without matching ordinary names', () => {
    expect(forbiddenPackagePath('assets/app.js')).toBeUndefined();
    expect(forbiddenPackagePath('assets/contest.js')).toBeUndefined();
    expect(forbiddenPackagePath('tests/result.js')).toBe('development directory');
    expect(forbiddenPackagePath('.env.production')).toBe('environment file');
    expect(forbiddenPackagePath('assets/app.js.map')).toBe('source map');
    expect(forbiddenPackagePath('assets/Demo-Printables-a1b2.png')).toBe('screenshot/demo tooling');
    expect(forbiddenPackagePath('assets/demo/screenshots/demo-results.json')).toBe('screenshot/demo tooling');
    expect(forbiddenPackagePath('assets/screenshot-entry-a1b2.js')).toBe('screenshot/demo tooling');
  });

  it('detects strong secret indicators without rejecting normal auth code', () => {
    expect(detectSecretCategories('headers.Authorization = `Bearer ${token}`')).toEqual([]);
    expect(detectSecretCategories(['Authorization: Bearer ', 'abcdefghijklmnopqrstuvwxyz123456'].join(''))).toContain('bearer token');
    expect(detectSecretCategories(['-----BEGIN PRIVATE ', 'KEY-----'].join(''))).toContain('private key');
  });

  it('detects screenshot bootstrap markers without matching production UI text', () => {
    expect(containsScreenshotTooling('renderScreenshotResults();')).toBe(true);
    expect(containsScreenshotTooling('POST /__tridijump_screenshot_ready')).toBe(true);
    expect(containsScreenshotTooling('Search 3D models in one place')).toBe(false);
  });

  it('validates package paths and hashes content', () => {
    expect(isSafePackagePath('manifest.json')).toBe(true);
    expect(isSafePackagePath('../manifest.json')).toBe(false);
    expect(isSafePackagePath('C:/manifest.json')).toBe(false);
    expect(sha256('tridiJump')).toHaveLength(64);
  });

  it('round-trips a deterministic ZIP with root files', () => {
    const entries = [{ path: 'manifest.json', data: Buffer.from('{"version":"1.0.0"}') }, { path: 'assets/app.js', data: Buffer.from('export {};') }];
    const first = createDeterministicZip(entries);
    const second = createDeterministicZip([...entries].reverse());
    expect(first.equals(second)).toBe(true);
    expect(readZipEntries(first).map((entry) => entry.path)).toEqual(['assets/app.js', 'manifest.json']);
  });
});
