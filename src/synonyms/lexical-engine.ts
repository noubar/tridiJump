// SPDX-License-Identifier: GPL-3.0-or-later
import { MAX_QUERY_LENGTH, normalizeQuery } from '../search/query';
import { normalizeLexicalKey } from './lexical-key';
import { PackagedLexicon } from './packaged-lexicon';
import type { LexicalSenses } from './packaged-lexicon';

export type CandidateSource = 'ding-translation' | 'oewn-synonym' | 'compound' | 'phrase-reconstruction' | 'translation-enrichment';
export interface LexicalCandidate { text: string; source: CandidateSource; score: number; order: number }

// Ranking only: these words never create a candidate that is absent from OEWN/Ding.
const PRODUCT_HEADS = new Set(['box', 'bracket', 'case', 'casing', 'clip', 'cover', 'enclosure', 'handle', 'headphone', 'holder', 'hook', 'housing', 'lid', 'mount', 'phone', 'rack', 'shell', 'stand', 'tool', 'wheel']);
const GERMAN_PRODUCT_TERMS = new Set(['aufbewahrung', 'befestigung', 'box', 'fassung', 'gehäuse', 'halter', 'halterung', 'kiste', 'ständer', 'telefon', 'wand', 'werkzeug']);
const PROTECTED_PHRASES = ['Raspberry Pi', 'Arduino', 'ESP32', 'Bambu', 'Prusa'] as const;
const LINKING_ELEMENTS = ['es', 'en', 'er', 's', 'n', 'e'] as const;

function candidateScore(text: string): number {
  const normalized = normalizeLexicalKey(text);
  const words = normalized.split(' ');
  const productHead = isProductTerm(text);
  return (productHead || GERMAN_PRODUCT_TERMS.has(normalized) ? 30 : 0)
    + (words.length <= 2 ? 4 : 0) - Math.max(0, words.length - 3) * 3;
}

function isProductTerm(text: string): boolean {
  let head = normalizeLexicalKey(text).split(' ').at(-1) ?? '';
  if (head.endsWith('s')) head = head.slice(0, -1);
  return [...PRODUCT_HEADS].some((value) => head === value || (head.length > value.length + 2 && head.endsWith(value)));
}

function rankedTerms(senses: LexicalSenses, limit = 8): string[] {
  return senses.flatMap((sense, senseIndex) => sense.map((text, termIndex) => ({ text, rank: candidateScore(text) - senseIndex * 3 - termIndex / 10 })))
    .sort((left, right) => right.rank - left.rank)
    .filter((value, index, values) => values.findIndex((other) => normalizeLexicalKey(other.text) === normalizeLexicalKey(value.text)) === index)
    .slice(0, limit).map(({ text }) => text);
}

function protectedRanges(query: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const normalized = normalizeLexicalKey(query);
  for (const phrase of PROTECTED_PHRASES) {
    const index = normalized.indexOf(normalizeLexicalKey(phrase));
    if (index >= 0) ranges.push({ start: index, end: index + phrase.length });
  }
  return ranges;
}

function isProtected(start: number, end: number, token: string, ranges: readonly { start: number; end: number }[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start) || /\d/.test(token);
}

function likelyGerman(original: string, de: LexicalSenses, en: LexicalSenses): boolean {
  return /[äöüß]/iu.test(original) || (de.length > 0 && en.length === 0)
    || (/^\p{Lu}/u.test(original) && de.length > 0);
}

function add(candidates: LexicalCandidate[], text: string, source: CandidateSource, score: number): void {
  const clean = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (clean && clean.length <= MAX_QUERY_LENGTH) candidates.push({ text: clean, source, score, order: candidates.length });
}

export class LexicalEngine {
  private readonly lexicon: PackagedLexicon;

  constructor(lexicon = new PackagedLexicon()) { this.lexicon = lexicon; }

  private async simpleCandidates(word: string): Promise<{ german: boolean; candidates: LexicalCandidate[] }> {
    const [synonyms, de, en] = await Promise.all([
      this.lexicon.lookup('synonyms', word),
      this.lexicon.lookup('translations/de', word),
      this.lexicon.lookup('translations/en', word),
    ]);
    const german = likelyGerman(word, de, en);
    const candidates: LexicalCandidate[] = [];
    if (german) {
      const translations = rankedTerms(de);
      const supported = new Set(translations.map(normalizeLexicalKey));
      for (const text of translations) add(candidates, text, 'ding-translation', 120 + candidateScore(text));
      for (const translation of translations.slice(0, 3)) {
        const enriched = await this.lexicon.lookup('synonyms', translation);
        for (const text of rankedTerms(enriched.slice(0, 1), 3)) {
          if (supported.has(normalizeLexicalKey(text))) add(candidates, text, 'translation-enrichment', 75 + candidateScore(text));
        }
      }
    } else {
      const originalTranslations = new Set(en.flat().map(normalizeLexicalKey));
      for (const text of rankedTerms(synonyms.slice(0, 1), 2)) {
        const translated = await this.lexicon.lookup('translations/en', text);
        const corroborated = translated.flat().some((value) => originalTranslations.has(normalizeLexicalKey(value)));
        add(candidates, text, 'oewn-synonym', 115 + candidateScore(text) + (corroborated ? 10 : originalTranslations.size ? -30 : 0));
      }
      for (const text of rankedTerms(en)) add(candidates, text, 'ding-translation', 95 + candidateScore(text));
    }
    return { german, candidates };
  }

  private async decomposeGermanCompound(word: string): Promise<LexicalCandidate[]> {
    const normalized = normalizeLexicalKey(word);
    if (!/^\p{L}{7,}$/u.test(normalized)) return [];
    let split: { left: string; right: string } | undefined;
    // German compounds are right-headed. Probe short-to-long head candidates
    // sequentially and stop at the first fully evidenced split. Besides being a
    // conservative choice, this avoids parsing most translation buckets merely
    // to reject impossible boundaries.
    for (let rightLength = 3; rightLength <= normalized.length - 3 && !split; rightLength++) {
      const index = normalized.length - rightLength;
      const rawLeft = normalized.slice(0, index);
      const right = normalized.slice(index);
      const rightSenses = await this.lexicon.lookup('translations/de', right);
      if (!rightSenses.length) continue;
      const leftVariants = [{ value: rawLeft, linking: 0 }, ...LINKING_ELEMENTS.filter((link) => rawLeft.endsWith(link) && rawLeft.length - link.length >= 3)
        .map((link) => ({ value: rawLeft.slice(0, -link.length), linking: link.length }))];
      for (const left of leftVariants.sort((a, b) => a.linking - b.linking)) {
        if ((await this.lexicon.lookup('translations/de', left.value)).length) {
          split = { left: left.value, right };
          break;
        }
      }
    }
    if (!split) return [];
    const [leftSenses, rightSenses] = await Promise.all([
      this.lexicon.lookup('translations/de', split.left), this.lexicon.lookup('translations/de', split.right),
    ]);
    const modifiers = rankedTerms(leftSenses, 3);
    const heads = rankedTerms(rightSenses, 3);
    const candidates: LexicalCandidate[] = [];
    const modifier = modifiers[0];
    if (!modifier) return [];
    const singularModifier = await this.attributiveModifier(modifier);
    for (const [headIndex, head] of heads.entries()) {
      add(candidates, `${singularModifier} ${head}`, 'compound', 110 + candidateScore(head) - headIndex);
    }
    return candidates;
  }

  private async attributiveModifier(value: string): Promise<string> {
    if (!value.endsWith('s') || value.length < 5) return value;
    const singular = value.slice(0, -1);
    const [synonyms, translations] = await Promise.all([
      this.lexicon.lookup('synonyms', singular), this.lexicon.lookup('translations/en', singular),
    ]);
    return synonyms.length || translations.length ? singular : value;
  }

  private async phraseCandidates(query: string): Promise<LexicalCandidate[]> {
    const words = [...query.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu)].map((match) => ({
      text: match[0], start: match.index, end: match.index + match[0].length,
    }));
    const ranges = protectedRanges(query);
    const transformable = words.filter((word) => !isProtected(word.start, word.end, word.text, ranges));
    const candidates: LexicalCandidate[] = [];
    for (const word of transformable.slice(-1)) {
      const simple = await this.simpleCandidates(word.text);
      for (const replacement of simple.candidates.slice(0, 3)) {
        const mixedLanguage = replacement.source === 'ding-translation' && transformable.length > 1 && ranges.length === 0;
        if (mixedLanguage) continue;
        if (isProductTerm(word.text) && replacement.source === 'oewn-synonym' && !isProductTerm(replacement.text)) continue;
        add(candidates, query.slice(0, word.start) + replacement.text + query.slice(word.end), 'phrase-reconstruction', replacement.score - 5);
      }
    }

    if (transformable.length > 1 && ranges.length === 0) {
      const translations = await Promise.all(transformable.map((word) => this.lexicon.lookup('translations/en', word.text)));
      if (translations.every((senses) => senses.length)) {
        const choices = translations.map((senses) => rankedTerms(senses, 2));
        const primary = choices.map((choice) => choice[0]).filter((value): value is string => Boolean(value));
        if (primary.length === choices.length) add(candidates, primary.join(' '), 'phrase-reconstruction', 105);
        const alternateHead = choices.at(-1)?.[1];
        if (alternateHead && primary.length === choices.length) add(candidates, [...primary.slice(0, -1), alternateHead].join(' '), 'phrase-reconstruction', 104);
      }
    }
    return candidates;
  }

  async expand(input: string): Promise<string[]> {
    const original = normalizeQuery(input);
    if (!original) return [];
    let candidates: LexicalCandidate[];
    if (/\s/u.test(original)) candidates = await this.phraseCandidates(original);
    else {
      const simple = await this.simpleCandidates(original);
      candidates = [...simple.candidates, ...(await this.decomposeGermanCompound(original))];
    }
    candidates.sort((left, right) => right.score - left.score || left.order - right.order || left.text.localeCompare(right.text));
    const result = [original];
    const seen = new Set([normalizeLexicalKey(original).replace(/[\p{P}\p{S}]/gu, '')]);
    for (const candidate of candidates) {
      const key = normalizeLexicalKey(candidate.text).replace(/[\p{P}\p{S}]/gu, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(candidate.text);
      if (result.length === 4) break;
    }
    return result;
  }
}
