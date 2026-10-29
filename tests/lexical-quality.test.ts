// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { testLexicalEngine } from './helpers/lexicon';

const engine = testLexicalEngine();
const qualityCorpus = [
  'car', 'gear', 'case', 'holder', 'mount', 'box', 'cover', 'stand', 'tool', 'phone',
  'Auto', 'Zahnrad', 'Gehäuse', 'Halter', 'Halterung', 'Kiste', 'Abdeckung', 'Ständer', 'Werkzeug', 'Handy',
  'phone holder', 'wall mount', 'tool holder', 'storage box', 'Raspberry Pi case',
  'Handyhalter', 'Wandhalterung', 'Werkzeughalter', 'Aufbewahrungsbox', 'Raspberry Pi Gehäuse', 'Kopfhörerständer',
  // Previously unused ambiguous vocabulary from the real sources.
  'arm', 'base', 'seal', 'Bank', 'Schloss',
] as const;

describe('precision-oriented lexical quality', () => {
  it.each(qualityCorpus)('keeps %s deterministic, deduplicated and within the 1-4 query contract', async (query) => {
    const first = await engine.expand(query);
    expect(first[0]).toBe(query);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(new Set(first.map((value) => value.normalize('NFC').toLocaleLowerCase('de-DE').replace(/[\p{P}\p{S}]/gu, ''))).size).toBe(first.length);
    expect(await engine.expand(query)).toEqual(first);
  });

  it.each([
    ['gear', /ausrüstung|equipment/iu],
    ['Gehäuse', /casing box/iu],
    ['Wandhalterung', /indoor/iu],
    ['Aufbewahrungsbox', /loudspeaker|tidy/iu],
    ['Raspberry Pi Gehäuse', /casing box/iu],
    ['Kopfhörerständer', /upright|pillar/iu],
  ] as const)('does not leak a weak unrelated sense into %s', async (query, rejected) => {
    expect((await engine.expand(query)).slice(1).join(' ')).not.toMatch(rejected);
  });

  it('prefers strong exact compound translations and concise evidence-backed heads', async () => {
    expect(await engine.expand('Werkzeughalter')).toEqual(['Werkzeughalter', 'tool holder']);
    expect(await engine.expand('Aufbewahrungsbox')).toEqual(['Aufbewahrungsbox', 'storage box']);
    expect(await engine.expand('Kopfhörerständer')).toEqual(['Kopfhörerständer', 'headphone stand']);
    expect((await engine.expand('Wandhalterung'))[1]).toBe('wall mount');
  });
});
