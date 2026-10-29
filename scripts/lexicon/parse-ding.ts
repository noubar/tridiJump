// SPDX-License-Identifier: GPL-3.0-or-later
import { addSense } from './model.ts';
import type { LexicalIndex } from './model.ts';

const NOUN_MARKER = /\{(?:m|f|n|pl)\}/;

function removeBalancedAnnotations(value: string): string {
  let current = value;
  for (let pass = 0; pass < 3; pass++) current = current.replace(/\([^()]*\)/g, ' ');
  return current.replace(/\[[^\]]*\]|\{[^}]*\}|<[^>]*>/g, ' ');
}

export function cleanDingTerm(value: string): string | undefined {
  const clean = removeBalancedAnnotations(value)
    .replace(/\s+/g, ' ')
    .replace(/^[,;:.\s-]+|[,;:.\s-]+$/g, '')
    .trim();
  if (!clean || clean.length > 100 || /[|{}[\]<>]/.test(clean) || clean.includes('/') || clean.includes('...')) return undefined;
  return clean;
}

export function parseDingAlternatives(segment: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of segment.split(/\s*;\s*/)) {
    const clean = cleanDingTerm(raw);
    const key = clean?.normalize('NFC').toLocaleLowerCase('de-DE');
    if (clean && key && !seen.has(key)) { seen.add(key); result.push(clean); }
  }
  return result;
}

export interface DingConversion {
  deToEn: LexicalIndex;
  enToDe: LexicalIndex;
  nounRecords: number;
}

/** Parse only the aligned base-lemma segment of noun records; later pipe groups contain inflections/examples. */
export function convertDing(text: string): DingConversion {
  const deToEn: LexicalIndex = new Map();
  const enToDe: LexicalIndex = new Map();
  let nounRecords = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(' :: ');
    if (separator < 0) continue;
    const germanSegment = line.slice(0, separator).split(/\s+\|\s+/)[0]!;
    const englishSegment = line.slice(separator + 4).split(/\s+\|\s+/)[0]!;
    if (!NOUN_MARKER.test(germanSegment)) continue;
    const german = parseDingAlternatives(germanSegment);
    const english = parseDingAlternatives(englishSegment);
    if (!german.length || !english.length) continue;
    nounRecords++;
    // Identically spelled cross-language lemmas still matter when reconstructing phrases.
    for (const source of german) addSense(deToEn, source, english, false);
    for (const source of english) addSense(enToDe, source, german, false);
  }
  return { deToEn, enToDe, nounRecords };
}
