// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { screenshotTiles, validateScreenshotTiles } from '../src/screenshots/fixture';

const directory = new URL('../assets/demo/screenshots/', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('demo-results.json', directory), 'utf8')) as Array<Record<string, string>>;

describe('copyright-safe screenshot fixture', () => {
  it('contains each supported provider once with honest retrieval modes', () => {
    expect(() => validateScreenshotTiles()).not.toThrow();
    expect(screenshotTiles.map((tile) => tile.providerId).sort()).toEqual([
      'cults3d', 'makerworld', 'myminifactory', 'printables', 'thangs', 'thingiverse',
    ]);
    expect(screenshotTiles.filter((tile) => tile.mode === 'aggregated')).toHaveLength(4);
    expect(screenshotTiles.filter((tile) => tile.mode === 'direct-search').map((tile) => tile.providerId).sort()).toEqual(['makerworld', 'thangs']);
  });

  it('uses six uncropped local PNGs without provider URLs', () => {
    expect(fixture).toHaveLength(6);
    for (const tile of fixture) {
      expect(JSON.stringify(tile)).not.toMatch(/https?:\/\//i);
      const png = readFileSync(new URL(tile.thumbnail!, directory));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1448, 1086]);
    }
  });
});
