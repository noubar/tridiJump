// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { testLexicalEngine } from './helpers/lexicon';

const engine = testLexicalEngine();

describe('generated offline lexical expansion', () => {
  it.each([
    ['car', ['auto', 'automobile']],
    ['gear', ['gear wheel']],
    ['case', ['shell', 'casing']],
    ['holder', ['Halterung']],
    ['mount', ['Fassung']],
    ['box', ['Gehäuse', 'Kiste']],
    ['cover', ['Abdeckung']],
    ['stand', ['Ständer']],
    ['tool', ['Werkzeug']],
    ['phone', ['telephone', 'Telefon']],
    ['Auto', ['car', 'automobile']],
    ['Zahnrad', ['gearwheel', 'toothed wheel']],
    ['Gehäuse', ['case']],
    ['Halter', ['bracket', 'holder']],
    ['Halterung', ['holder']],
    ['Kiste', ['box', 'case']],
    ['Abdeckung', ['cover']],
    ['Ständer', ['stand']],
    ['Werkzeug', ['tool']],
    ['Handy', ['mobile phone']],
    ['Kopfhörer', ['headphones']],
  ])('uses the real generated assets for %s', async (query, useful) => {
    const expanded = await engine.expand(query);
    expect(expanded[0]).toBe(query);
    expect(expanded.slice(1)).toEqual(expect.arrayContaining(useful));
  });

  it('uses only same-synset concrete nouns and does not traverse the OEWN graph', async () => {
    const car = await engine.expand('car');
    expect(car).toEqual(expect.arrayContaining(['car', 'auto', 'automobile']));
    expect(car).not.toContain('vehicle');
    expect(await engine.expand('case')).toEqual(['case', 'shell', 'casing']);
    expect((await engine.expand('gear')).slice(1)).toContain('gear wheel');
  });

  it.each([
    ['phone holder', ['Telefon Halterung']],
    ['wall mount', ['Wand Fassung']],
    ['tool holder', ['Werkzeug Halterung']],
    ['storage box', ['Aufbewahrung Box']],
    ['Raspberry Pi case', ['Raspberry Pi shell', 'Raspberry Pi casing']],
    ['Handyhalter', ['mobile phone holder']],
    ['Wandhalterung', ['wall mount']],
    ['Werkzeughalter', ['tool holder']],
    ['Aufbewahrungsbox', ['storage box']],
    ['Raspberry Pi Gehäuse', ['Raspberry Pi case']],
    ['Kopfhörerständer', ['headphone stand']],
  ])('reconstructs useful phrase/compound variants for %s', async (query, useful) => {
    expect(await engine.expand(query)).toEqual(expect.arrayContaining([query, ...useful]));
  });

  it('decomposes an unlisted compound from component evidence rather than a phrase override', async () => {
    const expanded = await engine.expand('Telefonhalter');
    expect(expanded[0]).toBe('Telefonhalter');
    expect(expanded.some((value) => /phone|telephone/i.test(value) && /holder|bracket/i.test(value))).toBe(true);
  });

  it.each([' GEAR ', 'Gehäuse', 'Geha\u0308use'])('normalizes only lookup keys while retaining the trimmed original: %s', async (query) => {
    const expanded = await engine.expand(query);
    expect(expanded[0]).toBe(query.trim());
    const keys = expanded.map((value) => value.normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('de-DE'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('retains protected product names and technical identifiers', async () => {
    for (const product of ['Raspberry Pi', 'ESP32', 'Arduino', 'Bambu', 'Prusa']) {
      const expanded = await engine.expand(`${product} Gehäuse`);
      expect(expanded.every((query) => query.startsWith(`${product} `))).toBe(true);
    }
  });

  it('keeps unknown input original-only and enforces global bounds deterministically', async () => {
    expect(await engine.expand('xqzvblorp123')).toEqual(['xqzvblorp123']);
    expect(await engine.expand('')).toEqual([]);
    const first = await engine.expand('Zahnrad');
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(await engine.expand('Zahnrad')).toEqual(first);
    expect(first.every((value) => value.trim() && value.length <= 200)).toBe(true);
  });

  it('omits overlong reconstructed alternatives rather than clipping the query', async () => {
    const query = `${'P'.repeat(195)} case`;
    expect(await engine.expand(query)).toEqual([query]);
  });
});
