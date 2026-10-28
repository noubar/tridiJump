// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeQuery } from '../search/query';
import { createCultsProvider, cultsSearchUrl } from './cults3d';
import { createMyMiniFactoryProvider } from './myminifactory';
import { createThingiverseProvider } from './thingiverse';

// Current V1 disposition, not a claim that these services have no APIs at all.
// Packaged composition only, never a remote/declarative authentication registry.
// Do not merge user credential values into this list.
// See docs/live-provider-enablement.md for evidence and verification limits.
export const providerAvailability = [
  { id: 'printables', name: 'Printables', classification: 'D',
    reason: 'Aggregation unavailable: no approved public interface; Prusa terms restrict extraction.',
    searchUrl: (query: string) => queryUrl('https://www.printables.com/search/models', 'q', query) },
  { id: 'makerworld', name: 'MakerWorld', classification: 'D',
    reason: 'Aggregation unavailable: no supported public search interface verified.',
    searchUrl: (query: string) => queryUrl('https://makerworld.com/en/search/models', 'keyword', query) },
  { id: 'thingiverse', name: 'Thingiverse', classification: 'B',
    reason: 'Official API search with your App Token.',
    createProvider: createThingiverseProvider,
    searchUrl: (query: string) => {
      const target = new URL(queryUrl('https://www.thingiverse.com/search', 'q', query));
      target.searchParams.set('type', 'things');
      return target.href;
    } },
  { id: 'thangs', name: 'Thangs', classification: 'D',
    reason: 'Aggregation unavailable: no public catalog API verified; scraping is prohibited.',
    searchUrl: (query: string) => {
      const target = new URL(`https://thangs.com/search/${encodeURIComponent(normalizeQuery(query))}`);
      target.searchParams.set('scope', 'thangs');
      target.searchParams.set('view', 'grid');
      return target.href;
    } },
  { id: 'myminifactory', name: 'MyMiniFactory', classification: 'B',
    reason: 'Official API search with your API key.',
    createProvider: createMyMiniFactoryProvider,
    searchUrl: (query: string) => queryUrl('https://www.myminifactory.com/search/', 'query', query) },
  { id: 'cults3d', name: 'Cults3D', classification: 'B',
    reason: 'Official API search with your nickname and API key.',
    createProvider: createCultsProvider,
    searchUrl: cultsSearchUrl },
] as const;

function queryUrl(base: string, parameter: string, query: string): string {
  const target = new URL(base);
  target.searchParams.set(parameter, normalizeQuery(query));
  return target.href;
}
