// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, it, vi } from 'vitest';
import { bucketForKey } from '../src/synonyms/lexical-key';
import { fetchPackagedChunk, PackagedLexicon } from '../src/synonyms/packaged-lexicon';
import { loadGeneratedChunk } from './helpers/lexicon';

it('selects the stable packaged chunk and reuses it', async () => {
  const loader = vi.fn(loadGeneratedChunk);
  const lexicon = new PackagedLexicon(loader);
  expect((await lexicon.lookup('synonyms', 'car')).flat()).toContain('automobile');
  expect((await lexicon.lookup('synonyms', 'CAR')).flat()).toContain('auto');
  expect(loader).toHaveBeenCalledTimes(1);
  expect(loader).toHaveBeenCalledWith('synonyms', bucketForKey('car'));
});

it.each([
  ['missing chunk', async () => { throw new Error('missing'); }],
  ['invalid chunk', async () => ({ format: 99, entries: { car: [['bad']] } })],
] as const)('%s fails closed and remains cached', async (_name, loader) => {
  const request = vi.fn(loader);
  const lexicon = new PackagedLexicon(request);
  await expect(lexicon.lookup('synonyms', 'car')).resolves.toEqual([]);
  await expect(lexicon.lookup('synonyms', 'car')).resolves.toEqual([]);
  expect(request).toHaveBeenCalledTimes(1);
});

it('loads packaged data through the Firefox browser runtime when available', async () => {
  const request = vi.fn(async () => new Response('{"format":1,"entries":{}}'));
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('chrome', { runtime: { getURL: () => 'chrome-extension://wrong/chunk.json' } });
  vi.stubGlobal('browser', { runtime: { getURL: (path: string) => `moz-extension://firefox/${path}` } });
  await fetchPackagedChunk('synonyms', '00');
  expect(request).toHaveBeenCalledWith('moz-extension://firefox/lexical-data/synonyms/00.json', { credentials: 'omit' });
  vi.unstubAllGlobals();
});
