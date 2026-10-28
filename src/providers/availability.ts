// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeQuery } from '../search/query';
import { cultsSearchUrl } from './cults3d';

// Current V1 disposition, not a claim that these services have no APIs at all.
// See docs/provider-classification.md for evidence and conditions for enabling each.
export const providerAvailability = [
  { id: 'printables', name: 'Printables', classification: 'D',
    reason: 'Aggregation unavailable: no approved public interface; Prusa terms restrict extraction.',
    searchUrl: (query: string) => queryUrl('https://www.printables.com/search/models', 'q', query) },
  { id: 'makerworld', name: 'MakerWorld', classification: 'D',
    reason: 'Aggregation unavailable: no supported public search interface verified.',
    searchUrl: (query: string) => queryUrl('https://makerworld.com/en/search/models', 'keyword', query) },
  { id: 'thingiverse', name: 'Thingiverse', classification: 'D',
    reason: 'Aggregation pending verification of current developer access and API terms.',
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
  { id: 'myminifactory', name: 'MyMiniFactory', classification: 'D',
    reason: 'Aggregation pending verification of free key issuance and permitted extension use.',
    searchUrl: (query: string) => queryUrl('https://www.myminifactory.com/search/', 'query', query) },
  { id: 'cults3d', name: 'Cults3D', classification: 'D',
    reason: 'Aggregation pending confirmation of free API access. Existing keys do not enable it.',
    searchUrl: cultsSearchUrl },
] as const;

function queryUrl(base: string, parameter: string, query: string): string {
  const target = new URL(base);
  target.searchParams.set(parameter, normalizeQuery(query));
  return target.href;
}
