// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeLexicalKey } from '../../src/synonyms/lexical-key.ts';

export { bucketForKey, normalizeLexicalKey } from '../../src/synonyms/lexical-key.ts';
export type LexicalIndex = Map<string, string[][]>;

export function addSense(index: LexicalIndex, source: string, targets: readonly string[], removeEquivalent = true): void {
  const key = normalizeLexicalKey(source);
  if (!key || key.length > 100) return;
  const seen = new Set<string>();
  const cleanTargets = targets.filter((target) => {
    const normalized = normalizeLexicalKey(target);
    if (!normalized || (removeEquivalent && normalized === key) || seen.has(normalized) || target.length > 100) return false;
    seen.add(normalized);
    return true;
  });
  if (!cleanTargets.length) return;
  const senses = index.get(key) ?? [];
  const signature = cleanTargets.map(normalizeLexicalKey).join('\0');
  if (!senses.some((sense) => sense.map(normalizeLexicalKey).join('\0') === signature)) senses.push(cleanTargets);
  index.set(key, senses);
}
