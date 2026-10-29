// SPDX-License-Identifier: GPL-3.0-or-later

/** Internal lookup normalization; the user's original query is never changed. */
export function normalizeLexicalKey(value: string): string {
  return value.normalize('NFC')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('de-DE');
}

/** Sixty-four stable FNV-1a buckets keep packaged JSON chunks and memory bounded. */
export function bucketForKey(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of normalizeLexicalKey(value)) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0 & 63).toString(16).padStart(2, '0');
}
