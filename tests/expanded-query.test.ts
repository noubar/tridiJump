// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { expandQuery } from '../src/synonyms/expand-query';

describe('production local phrase expansion', () => {
  it.each([
    ['Zahnrad', ['Zahnrad', 'gear', 'cogwheel', 'cog']],
    ['gear', ['gear', 'Zahnrad', 'cogwheel', 'cog']],
    ['phone holder', ['phone holder', 'Handyhalter', 'smartphone holder', 'phone mount']],
    ['Handyhalter', ['Handyhalter', 'phone holder', 'smartphone holder', 'phone mount']],
    ['Raspberry Pi Gehäuse', ['Raspberry Pi Gehäuse', 'Raspberry Pi case', 'Raspberry Pi enclosure', 'Raspberry Pi housing']],
    ['raspberry pi case', ['raspberry pi case', 'raspberry pi Gehäuse', 'raspberry pi enclosure', 'raspberry pi housing']],
  ])('expands %s into useful bounded alternatives', (query, expected) => {
    expect(expandQuery(query)).toEqual(expected);
  });

  it.each([' GEAR ', 'PHONE   HOLDER', 'Gehäuse', 'Geha\u0308use'])('deduplicates case, whitespace and Unicode equivalents: %s', (query) => {
    const expanded = expandQuery(query);
    expect(expanded[0]).toBe(query.trim());
    expect(expanded.length).toBeGreaterThan(1);
    expect(expanded.length).toBeLessThanOrEqual(4);
    const keys = expanded.map((value) => value.normalize('NFC').replace(/\s+/g, ' ').toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(expanded.every((value) => value.trim().length > 0)).toBe(true);
  });

  it.each(['', '  \t\n'])('never emits blanks: %j', (query) => { expect(expandQuery(query)).toEqual([]); });
  it.each(['xyzzy', 'iPhone', 'showcase', 'gearbox', 'cogwheelhouse', 'Bambu Lab', 'Adapter'])('leaves unknown or partial-word matches alone: %s', (query) => {
    expect(expandQuery(query)).toEqual([query]);
  });
  it.each(['Raspberry Pi', 'ESP32', 'Arduino', 'iPhone', 'Samsung', 'Bambu Lab'])('retains product name %s when replacing surrounding generic text', (product) => {
    const expanded = expandQuery(`${product} Gehäuse`);
    expect(expanded).toContain(`${product} case`);
    expect(expanded.every((query) => query.startsWith(`${product} `))).toBe(true);
  });
  it('prefers the longest full phrase and never independently combines every word', () => {
    expect(expandQuery('Arduino phone holder case')).toEqual([
      'Arduino phone holder case', 'Arduino Handyhalter case', 'Arduino smartphone holder case', 'Arduino phone mount case',
    ]);
  });
  it('degrades conservatively for mixed-language input', () => {
    expect(expandQuery('ESP32 Gehäuse holder')).toContain('ESP32 case holder');
    expect(expandQuery('ESP32 Gehäuse holder')).toHaveLength(4);
  });
  it('omits overlong alternatives rather than clipping a product name', () => {
    const query = 'P'.repeat(195) + ' case';
    expect(expandQuery(query)).toEqual([query]);
  });
});
