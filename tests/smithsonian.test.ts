// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSmithsonianProvider, normalizeSmithsonianPage, smithsonianCredentialFields, smithsonianSearchUrl } from '../src/providers/smithsonian';
import { saveCredentials, clearCredentials, SetupRequired } from '../src/providers/credentials';
import { SearchOrchestrator, type SearchSnapshot } from '../src/search/orchestrator';
import { canSort, priceKind } from '../src/results/result-options';
import type { Provider } from '../src/providers/provider';
import { providerAvailability } from '../src/providers/availability';
import { mockExtensionStorage } from './helpers/extension-storage';
import { repositoryEnabled } from '../src/shared/preferences';
import fixture from './fixtures/smithsonian/search.json';

const KEY = 'FAKE-SMITHSONIAN-KEY';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Smithsonian Open Access provider', () => {
  it('uses encoded documented 3D search parameters and query-key authentication on the fixed origin', () => {
    const url = new URL(smithsonianSearchUrl('space suit & <tag>', KEY, 20));
    expect(url.origin + url.pathname).toBe('https://api.si.edu/openaccess/api/v1.0/search');
    expect(url.searchParams.get('q')).toBe('space suit & <tag> AND online_media_type:"3D Models"');
    expect(url.searchParams.get('start')).toBe('20'); expect(url.searchParams.get('rows')).toBe('20');
    expect(url.searchParams.get('sort')).toBe('relevancy'); expect(url.searchParams.get('api_key')).toBe(KEY);
  });

  it('normalizes IDs, title, credit, collection, unit, canonical viewer, preview, usage and actual formats', () => {
    const page = normalizeSmithsonianPage(fixture, 'apollo');
    expect(page.nextCursor).toBe('2');
    expect(page.results[0]).toEqual({
      id: '3d_package:11111111-1111-4111-8111-111111111111', providerId: 'smithsonian', query: 'apollo',
      title: 'Fixture Space Artifact', url: 'https://3d-api.si.edu/voyager/3d_package:11111111-1111-4111-8111-111111111111',
      thumbnail: 'https://3d-api.si.edu/content/document/3d_package:11111111-1111-4111-8111-111111111111/scene-image-thumb.jpg',
      creator: 'Fixture Workshop', description: 'A fictional fixture object.', collection: 'Fixture Aeronautics Collection',
      museum: 'Fixture Air and Space Museum', license: 'CC0', isFree: true, formats: ['obj', 'glb'], isDownloadable: true,
    });
    expect(page.results[1]).toMatchObject({ license: 'Usage conditions apply', formats: ['stl'], museum: 'Fixture Natural History Museum' });
    expect(page.results[1]).not.toHaveProperty('thumbnail'); expect(page.results[1]).not.toHaveProperty('creator');
    expect(page.results[1]).not.toHaveProperty('isFree'); expect(priceKind(page.results[1]!)).toBeUndefined();
    expect(page.results.every((item) => !('price' in item) && !('downloads' in item) && !('rating' in item) && !('popularity' in item))).toBe(true);
  });

  it('keeps unknown usage unknown and rejects malformed or non-3D records', () => {
    const unknown = structuredClone(fixture);
    delete (unknown.response.rows[0]!.content.descriptiveNonRepeating.online_media.media[0]! as { usage?: unknown }).usage;
    expect(normalizeSmithsonianPage(unknown, 'x').results[0]).not.toHaveProperty('license');
    expect(normalizeSmithsonianPage({ status: 200, response: { rows: [], rowCount: 0 } }, 'x')).toEqual({ results: [], nextCursor: undefined });
    expect(() => normalizeSmithsonianPage({}, 'x')).toThrow('unexpected search response');
    expect(() => normalizeSmithsonianPage({ status: 200, response: { rows: [{ title: '2D only' }], rowCount: 1 } }, 'x')).toThrow('no usable 3D');
  });

  it('requires local configuration, sends no auth header, redacts the key, and removal restores setup-required', async () => {
    mockExtensionStorage(); const provider = createSmithsonianProvider();
    await expect(provider.search('apollo')).rejects.toBeInstanceOf(SetupRequired);
    await saveCredentials('smithsonian', smithsonianCredentialFields, { apiKey: KEY });
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return new Response(JSON.stringify(fixture));
    }); vi.stubGlobal('fetch', request);
    expect(await provider.search('apollo')).toHaveLength(2);
    expect(String(request.mock.calls[0]![0])).toContain(`api_key=${KEY}`);
    expect(JSON.stringify(await provider.search('apollo'))).not.toContain(KEY);
    await clearCredentials('smithsonian');
    await expect(provider.search('apollo')).rejects.toBeInstanceOf(SetupRequired);
  });

  it.each([[400, 'rejected'], [401, 'denied access'], [403, 'denied access'], [429, 'rate limit'], [500, 'HTTP 500']])
  ('isolates HTTP %i without exposing the key', async (status, message) => {
    mockExtensionStorage(); await saveCredentials('smithsonian', smithsonianCredentialFields, { apiKey: KEY });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: KEY }), { status })));
    const error = await createSmithsonianProvider().search('fossil').catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain(message); expect((error as Error).message).not.toContain(KEY);
  });

  it('honors cancellation and validates pagination offsets', async () => {
    mockExtensionStorage(); await saveCredentials('smithsonian', smithsonianCredentialFields, { apiKey: KEY });
    const controller = new AbortController(); controller.abort();
    await expect(createSmithsonianProvider().search('chair', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(createSmithsonianProvider().searchPage!('chair', '20&evil=1')).rejects.toThrow('Invalid provider continuation');
  });

  it('declares specialist metadata and only honest sorts', () => {
    const source = providerAvailability.find((item) => item.id === 'smithsonian')!;
    expect(source).toMatchObject({ mode: 'remote-api', tier: 'specialist', classification: 'B' });
    expect(source.createProvider()).toMatchObject({ mode: 'remote-api', tier: 'specialist' });
    expect(repositoryEnabled(source, {})).toBe(false);
    expect(repositoryEnabled(source, { smithsonian: true })).toBe(true);
    const results = normalizeSmithsonianPage(fixture, 'x').results;
    expect(canSort(results, 'best')).toBe(true);
    for (const sort of ['latest', 'popularity', 'downloads', 'rating', 'price-asc', 'price-desc'] as const) expect(canSort(results, sort)).toBe(false);
  });
});

describe('Smithsonian orchestration', () => {
  it('appends pages, suppresses duplicate IDs and isolates another provider failure', async () => {
    mockExtensionStorage(); await saveCredentials('smithsonian', smithsonianCredentialFields, { apiKey: KEY });
    vi.stubGlobal('fetch', vi.fn(async (raw: string) => new Response(JSON.stringify(new URL(raw).searchParams.get('start') === '2'
      ? { status: 200, response: { rows: [fixture.response.rows[0], { ...fixture.response.rows[1], title: 'Page two', content: { ...fixture.response.rows[1]!.content, descriptiveNonRepeating: { ...fixture.response.rows[1]!.content.descriptiveNonRepeating, online_media: { media: [{ ...fixture.response.rows[1]!.content.descriptiveNonRepeating.online_media.media[0], voyagerId: '3d_package:33333333-3333-4333-8333-333333333333', content: 'https://3d-api.si.edu/voyager/3d_package:33333333-3333-4333-8333-333333333333' }] } } } }], rowCount: 4 } }
      : fixture))));
    const snapshots: SearchSnapshot[] = [];
    const broken: Provider = { id: 'broken', search: async () => { throw new Error('isolated'); } };
    const runner = new SearchOrchestrator((snapshot) => snapshots.push(snapshot));
    runner.start('apollo', [createSmithsonianProvider(), broken]);
    await vi.waitFor(() => expect(snapshots.at(-1)?.results).toHaveLength(2)); runner.loadMore();
    await vi.waitFor(() => expect(snapshots.at(-1)?.results).toHaveLength(3));
    expect(snapshots.at(-1)?.states.find((state) => state.providerId === 'broken')?.status).toBe('failed');
  });

  it('uses central Expanded Search and skips all variants when setup is required', async () => {
    mockExtensionStorage(); const request = vi.fn(); vi.stubGlobal('fetch', request); const snapshots: SearchSnapshot[] = [];
    new SearchOrchestrator((snapshot) => snapshots.push(snapshot)).start('space suit', [createSmithsonianProvider()], { expandedQueries: ['spacesuit', 'pressure suit'] });
    await vi.waitFor(() => expect(snapshots.at(-1)?.states[0]?.status).toBe('setup-required'));
    expect(request).not.toHaveBeenCalled();
  });
});
