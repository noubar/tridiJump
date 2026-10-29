// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOURCES } from '../scripts/lexicon/config.ts';
import { convertDing } from '../scripts/lexicon/parse-ding.ts';
import { convertOewn, OEWN_REQUIRED_FILES } from '../scripts/lexicon/parse-oewn.ts';

describe('lexical source converters', () => {
  it('extracts only same-synset concrete noun lemmas from OEWN deterministically', () => {
    const files = new Map(OEWN_REQUIRED_FILES.map((name) => [name, '{}']));
    files.set('noun.artifact.json', JSON.stringify({
      '1-n': { members: ['car', 'auto', 'automobile', 'auto'], partOfSpeech: 'n', hypernym: ['2-n'] },
      '2-n': { members: ['vehicle', 'conveyance'], partOfSpeech: 'n' },
      '3-v': { members: ['case', 'encase'], partOfSpeech: 'v' },
    }));
    files.set('entries-c.json', JSON.stringify({ car: { n: { sense: [{ synset: '1-n' }] } } }));
    const first = convertOewn(files);
    const second = convertOewn(files);
    expect(first.index.get('car')).toEqual([['auto', 'automobile']]);
    expect(first.index.has('vehicle')).toBe(false);
    expect(first.index.has('case')).toBe(false);
    expect([...second.index]).toEqual([...first.index]);
  });

  it('preserves Ding base-record alignment, equivalent lemmas, annotations and both directions', () => {
    const fixture = [
      '# Version :: fixture',
      'Mobiltelefon {n}; Funktelefon {n}; Handy {n} [telco.] | Mobiltelefone {pl}; Handys {pl} :: mobile phone; cell phone; cellphone | mobile phones; cellphones',
      'Halterung {f}; Halter {m}; Befestigung {f} :: mounting support; mounting bracket; holder',
      'gehen {v} :: to go',
    ].join('\n');
    const result = convertDing(fixture);
    expect(result.deToEn.get('handy')).toEqual([['mobile phone', 'cell phone', 'cellphone']]);
    expect(result.deToEn.get('mobiltelefon')).toEqual(result.deToEn.get('handy'));
    expect(result.deToEn.has('handys')).toBe(false);
    expect(result.enToDe.get('mobile phone')).toEqual([['Mobiltelefon', 'Funktelefon', 'Handy']]);
    expect(result.enToDe.get('holder')).toEqual([['Halterung', 'Halter', 'Befestigung']]);
    expect(result.deToEn.has('gehen')).toBe(false);
  });

  it('pins the exact verified upstream archives and generated provenance', () => {
    for (const source of Object.values(SOURCES)) {
      const data = readFileSync(new URL(`../lexical-source/archives/${source.file}`, import.meta.url));
      expect(createHash('sha256').update(data).digest('hex')).toBe(source.sha256);
    }
    const provenance = JSON.parse(readFileSync(new URL('../public/lexical-data/provenance.json', import.meta.url), 'utf8'));
    expect(provenance.generatedFormatVersion).toBe(1);
    expect(provenance.counts.oewnIndexedLemmas).toBeGreaterThan(10_000);
    expect(provenance.counts.dingGermanLemmas).toBeGreaterThan(170_000);
    expect(provenance.counts.dingEnglishLemmas).toBeGreaterThan(170_000);
  });
});
