// SPDX-License-Identifier: GPL-3.0-or-later
import { bucketForKey, normalizeLexicalKey } from './lexical-key';

export type LexiconKind = 'synonyms' | 'translations/de' | 'translations/en';
export type LexicalSenses = readonly (readonly string[])[];
export type LexiconChunkLoader = (kind: LexiconKind, bucket: string) => Promise<unknown>;

interface LexiconChunk { format: 1; entries: Record<string, string[][]> }

function validChunk(value: unknown): value is LexiconChunk {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LexiconChunk>;
  if (candidate.format !== 1 || !candidate.entries || typeof candidate.entries !== 'object') return false;
  return Object.entries(candidate.entries).every(([key, senses]) => Boolean(key) && Array.isArray(senses)
    && senses.every((sense) => Array.isArray(sense) && sense.every((term) => typeof term === 'string')));
}

function packagedUrl(kind: LexiconKind, bucket: string): string {
  const path = `lexical-data/${kind}/${bucket}.json`;
  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { getURL?: (path: string) => string } };
  }).chrome?.runtime;
  return runtime?.getURL ? runtime.getURL(path) : `/${path}`;
}

export async function fetchPackagedChunk(kind: LexiconKind, bucket: string): Promise<unknown> {
  const response = await fetch(packagedUrl(kind, bucket), { credentials: 'omit' });
  if (!response.ok) throw new Error(`Packaged lexical asset unavailable (${response.status}).`);
  return response.json() as Promise<unknown>;
}

export class PackagedLexicon {
  private readonly chunks = new Map<string, Promise<LexiconChunk | undefined>>();
  private readonly loadChunk: LexiconChunkLoader;

  constructor(loadChunk: LexiconChunkLoader = fetchPackagedChunk) { this.loadChunk = loadChunk; }

  async lookup(kind: LexiconKind, term: string): Promise<LexicalSenses> {
    const key = normalizeLexicalKey(term);
    if (!key) return [];
    const bucket = bucketForKey(key);
    const cacheKey = `${kind}/${bucket}`;
    let loading = this.chunks.get(cacheKey);
    if (!loading) {
      loading = this.loadChunk(kind, bucket).then((value) => validChunk(value) ? value : undefined, () => undefined);
      this.chunks.set(cacheKey, loading);
    }
    return (await loading)?.entries[key] ?? [];
  }
}
