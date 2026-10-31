// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeQuery } from '../search/query';
import { createCultsProvider, cultsSearchUrl } from './cults3d';
import { createMyMiniFactoryProvider } from './myminifactory';
import { createThingiverseProvider } from './thingiverse';
import { createPrintablesProvider } from './printables';
import { createSketchfabProvider } from './sketchfab';
import { createSmithsonianProvider } from './smithsonian';

// Current V1 disposition, not a claim that these services have no APIs at all.
// Packaged composition only, never a remote/declarative authentication registry.
// Do not merge user credential values into this list.
// See docs/live-provider-enablement.md for evidence and verification limits.
export const providerAvailability = [
  { id: 'printables', name: 'Printables', classification: 'A', mode: 'remote-api', tier: 'general',
    reason: 'Anonymous search and cover previews live verified by the user. Undocumented interface may change.',
    createProvider: createPrintablesProvider,
    searchUrl: (query: string) => queryUrl('https://www.printables.com/search/models', 'q', query) },
  { id: 'sketchfab', name: 'Sketchfab', classification: 'A', mode: 'remote-api', tier: 'general',
    reason: 'Official Data API v3 public model search; no credentials required.',
    createProvider: createSketchfabProvider,
    searchUrl: (query: string) => {
      const target = new URL(queryUrl('https://sketchfab.com/search', 'q', query));
      target.searchParams.set('type', 'models');
      return target.href;
    } },
  { id: 'smithsonian', name: 'Smithsonian 3D', classification: 'B', mode: 'remote-api', tier: 'specialist',
    defaultEnabled: false,
    reason: 'Official Open Access API 3D search with your free api.data.gov API key.',
    createProvider: createSmithsonianProvider,
    searchUrl: (query: string) => queryUrl('https://3d.si.edu/search', 'edan_q', query) },
  { id: 'makerworld', name: 'MakerWorld', classification: 'D', mode: 'direct-search', tier: 'general',
    reason: 'Aggregation unavailable: no supported public search interface verified.',
    searchUrl: (query: string) => queryUrl('https://makerworld.com/en/search/models', 'keyword', query) },
  { id: 'thingiverse', name: 'Thingiverse', classification: 'B', mode: 'remote-api', tier: 'general',
    reason: 'Official API search with your App Token.',
    createProvider: createThingiverseProvider,
    searchUrl: (query: string) => {
      const target = new URL(queryUrl('https://www.thingiverse.com/search', 'q', query));
      target.searchParams.set('type', 'things');
      return target.href;
    } },
  { id: 'thangs', name: 'Thangs', classification: 'D', mode: 'direct-search', tier: 'general',
    reason: 'Aggregation unavailable: no public catalog API verified; scraping is prohibited.',
    searchUrl: (query: string) => {
      const target = new URL(`https://thangs.com/search/${encodeURIComponent(normalizeQuery(query))}`);
      target.searchParams.set('scope', 'thangs');
      target.searchParams.set('view', 'grid');
      return target.href;
    } },
  { id: 'myminifactory', name: 'MyMiniFactory', classification: 'B', mode: 'remote-api', tier: 'general',
    reason: 'Official API search with your API key.',
    createProvider: createMyMiniFactoryProvider,
    searchUrl: (query: string) => queryUrl('https://www.myminifactory.com/search/', 'query', query) },
  { id: 'cults3d', name: 'Cults3D', classification: 'B', mode: 'remote-api', tier: 'general',
    reason: 'Official API search with your nickname and API key.',
    createProvider: createCultsProvider,
    searchUrl: cultsSearchUrl },
] as const;

function queryUrl(base: string, parameter: string, query: string): string {
  const target = new URL(base);
  target.searchParams.set(parameter, normalizeQuery(query));
  return target.href;
}
