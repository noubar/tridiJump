// SPDX-License-Identifier: GPL-3.0-or-later
import { MAX_QUERY_LENGTH, normalizeQuery } from '../search/query';

// Search alternatives, not claims of universally interchangeable translations.
// Full phrases win over shorter generic terms; ordering favors EN/DE discovery.
const phrases: readonly (readonly string[])[] = [
  ['phone holder', 'Handyhalter', 'smartphone holder', 'phone mount'],
  ['wall mount', 'Wandhalterung', 'wall bracket'],
  ['plant pot', 'Blumentopf', 'flower pot'],
  ['headphone stand', 'Kopfhörerständer', 'headphone holder'],
  ['gear', 'Zahnrad', 'cogwheel', 'cog'],
  ['case', 'Gehäuse', 'enclosure', 'housing'],
  ['holder', 'Halter', 'Halterung', 'mount'],
  ['box', 'Kiste', 'container'],
  ['lid', 'Deckel'],
  ['stand', 'Ständer'],
  ['bracket', 'Winkelhalter'],
  ['hook', 'Haken'],
  ['clip', 'Klammer'],
  ['knob', 'Knopf'],
  ['handle', 'Griff'],
  ['storage', 'Aufbewahrung'],
  ['keyboard', 'Tastatur'],
  ['mouse', 'Maus'],
  ['lamp', 'Lampe'],
  ['tool', 'Werkzeug'],
  ['toy', 'Spielzeug'],
];

function key(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').toLowerCase();
}

/** Original first, at most three local alternatives; no network or word products. */
export function expandQuery(input: string): string[] {
  const original = normalizeQuery(input);
  if (!original) return [];
  // Normalize only the matching copy: preserve the user's original and product casing.
  const matching = original.normalize('NFC');
  let best: { index: number; length: number; alternatives: readonly string[] } | undefined;
  for (const alternatives of phrases) {
    for (const phrase of alternatives) {
      const pattern = phrase.split(' ').join('\\s+');
      const match = new RegExp(`(^|[^\\p{L}\\p{N}_])(${pattern})(?=$|[^\\p{L}\\p{N}_])`, 'iu').exec(matching);
      if (!match) continue;
      const index = match.index + match[1]!.length;
      const length = match[2]!.length;
      if (!best || length > best.length || (length === best.length && index < best.index)) {
        best = { index, length, alternatives };
      }
    }
  }
  const queries = [original];
  const seen = new Set([key(original)]);
  if (best) {
    for (const alternative of best.alternatives) {
      const candidate = matching.slice(0, best.index) + alternative + matching.slice(best.index + best.length);
      // Do not truncate a replacement and silently damage the surrounding product name.
      if (candidate.length > MAX_QUERY_LENGTH || seen.has(key(candidate))) continue;
      seen.add(key(candidate));
      queries.push(candidate);
      if (queries.length === 4) break;
    }
  }
  return queries;
}
