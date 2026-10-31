// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../src/providers/catalogs/nasa.json';
import { createNasaProvider, NASA_CATALOG_SCHEMA_VERSION, validateNasaCatalog, type NasaCatalog } from '../src/providers/nasa';
import { buildCatalog, NASA_SOURCE_COMMIT, snapshotFromTree, type NasaTreeEntry } from '../scripts/nasa/catalog';
import { providerAvailability } from '../src/providers/availability';
import { SearchOrchestrator, type SearchSnapshot } from '../src/search/orchestrator';
import { canSort, priceKind } from '../src/results/result-options';
import { repositoryEnabled } from '../src/shared/preferences';
import { readRepositories, setRepositoryEnabled } from '../src/shared/preferences';
import { mockExtensionStorage } from './helpers/extension-storage';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const actual = catalogJson as NasaCatalog;

function smallCatalog(records: NasaCatalog['records']): NasaCatalog {
  return { metadata: { ...actual.metadata, sourceRecordCount: records.length, recordCount: records.length }, records };
}

describe('NASA catalog generation and schema', () => {
  it('validates the pinned generated catalog, record counts, unique IDs and canonical URLs', () => {
    const catalog = validateNasaCatalog(catalogJson);
    expect(catalog.metadata).toMatchObject({ provider: 'nasa', schemaVersion: NASA_CATALOG_SCHEMA_VERSION,
      sourceCommit: NASA_SOURCE_COMMIT, sourceRecordCount: 333, recordCount: 333 });
    expect(new Set(catalog.records.map((record) => record.id)).size).toBe(333);
    expect(catalog.records.every((record) => record.canonicalUrl.startsWith(`https://github.com/nasa/NASA-3D-Resources/tree/${NASA_SOURCE_COMMIT}/`))).toBe(true);
  });

  it('generates titles, descriptions, formats, official categories and printable state from a source-tree fixture', async () => {
    const tree: NasaTreeEntry[] = [
      { path: '3D Models/Test Orbiter', type: 'tree', sha: 'a' },
      { path: '3D Models/Test Orbiter/model.glb', type: 'blob', sha: 'b', size: 100 },
      { path: '3D Printing/Test Moon', type: 'tree', sha: 'c' },
      { path: '3D Printing/Test Moon/model.stl', type: 'blob', sha: 'd', size: 200 },
      { path: '3D Printing/Test Moon/readme.txt', type: 'blob', sha: 'e', size: 20 },
    ];
    const source = await snapshotFromTree(tree, async (path) => path.endsWith('readme.txt') ? 'Official fixture description.' : undefined);
    const generated = buildCatalog(source);
    expect(generated.records[0]).toMatchObject({ id: 'printable:test-moon', title: 'Test Moon', description: 'Official fixture description.',
      tags: ['3D Printing'], assetType: '3d-printable', is3DPrintable: true, formats: ['stl'] });
    expect(generated.records[1]).toMatchObject({ id: 'model:test-orbiter', title: 'Test Orbiter', tags: ['3D Models'], assetType: '3d-model', formats: ['glb'] });
    expect(generated.records[1]).not.toHaveProperty('is3DPrintable');
    expect(JSON.stringify(buildCatalog(source))).toBe(JSON.stringify(generated));
    expect(generated.records.every((record) => !('thumbnail' in record))).toBe(true);
  });

  it('rejects empty trees, duplicate generated IDs, malformed records and schema mismatches', async () => {
    await expect(snapshotFromTree([])).rejects.toThrow('no supported resource');
    const duplicate: NasaTreeEntry[] = [
      { path: '3D Models/Same', type: 'tree', sha: 'a' }, { path: '3D Models/Same/a.glb', type: 'blob', sha: 'b', size: 1 },
      { path: '3D Models/Same!', type: 'tree', sha: 'c' }, { path: '3D Models/Same!/b.glb', type: 'blob', sha: 'd', size: 1 },
    ];
    await expect(snapshotFromTree(duplicate).then(buildCatalog)).rejects.toThrow('Duplicate NASA catalog ID');
    expect(() => validateNasaCatalog({ ...catalogJson, metadata: { ...catalogJson.metadata, schemaVersion: 2 } })).toThrow('unsupported schema');
    expect(() => validateNasaCatalog({ ...catalogJson, metadata: { ...catalogJson.metadata, sourceRecordCount: 1 } })).toThrow('unsupported schema');
    expect(() => validateNasaCatalog(smallCatalog([{ ...actual.records[0]!, canonicalUrl: 'https://evil.example/model' }]))).toThrow('invalid record');
  });
});

describe('NASA local provider', () => {
  it('declares local-catalog/specialist metadata, needs no setup and defaults disabled', () => {
    const source = providerAvailability.find((item) => item.id === 'nasa')!;
    expect(source).toMatchObject({ classification: 'A', mode: 'local-catalog', tier: 'specialist' });
    expect(source.createProvider()).toMatchObject({ id: 'nasa', mode: 'local-catalog', tier: 'specialist' });
    expect(source.createProvider().credentialFields).toBeUndefined();
    expect(repositoryEnabled(source, {})).toBe(false);
  });

  it('can be disabled and re-enabled through ordinary repository settings without credentials', async () => {
    mockExtensionStorage();
    const source = providerAvailability.find((item) => item.id === 'nasa')!;
    await setRepositoryEnabled('nasa', false);
    expect(repositoryEnabled(source, await readRepositories())).toBe(false);
    await setRepositoryEnabled('nasa', true);
    expect(repositoryEnabled(source, await readRepositories())).toBe(true);
  });

  it.each([
    ['Saturn V', 'Saturn V'], ['saturn', 'Saturn V'], ['international space station', 'International Space Station'],
    ['ISS', 'International Space Station'], ['mars rover', 'Mars'], ['habitable zone', 'Kepler 1-33 scale'],
    ['3d printing', 'Apollo 11 - Landing Site'], ['space shuttle', 'Space Shuttle'], ['spacesuit', 'Spacesuit'],
    ['rocket', 'Rocket'], ['moon', 'Moon'],
  ])('searches title, partial title, acronym, description and official category locally: %s', async (query, expected) => {
    const results = await createNasaProvider().search(query);
    expect(results.some((result) => result.title.includes(expected))).toBe(true);
  });

  it('orders deterministic title matches ahead of description-only matches and preserves normalized metadata', async () => {
    const records = [
      { ...actual.records[0]!, id: 'model:description', title: 'Other Object', description: 'Apollo mission artifact' },
      { ...actual.records[1]!, id: 'model:title', title: 'Apollo Vehicle', description: undefined },
    ];
    const results = await createNasaProvider(smallCatalog(records)).search('apollo');
    expect(results.map((result) => result.id)).toEqual(['model:title', 'model:description']);
    expect(results[0]).toMatchObject({ providerId: 'nasa', title: 'Apollo Vehicle', assetType: '3d-model', isFree: true,
      isDownloadable: true, license: 'NASA Images and Media Usage Guidelines', attribution: 'NASA' });
    expect(results[0]).not.toHaveProperty('thumbnail');
    expect(results.every((result) => !('price' in result) && !('rating' in result) && !('downloads' in result) && !('popularity' in result))).toBe(true);
  });

  it('maps only official 3D Printing classification to printable and keeps general model printability unknown', async () => {
    const printable = (await createNasaProvider().search('Apollo 11 Landing Site'))[0]!;
    expect(printable.is3DPrintable).toBe(true);
    const model = (await createNasaProvider().search('Advanced Crew Escape Suit'))[0]!;
    expect(model).not.toHaveProperty('is3DPrintable');
    expect(priceKind(printable)).toBe('free');
  });

  it('paginates local matches without duplicates and stops at the end', async () => {
    const provider = createNasaProvider();
    const first = await provider.searchPage!('mars');
    expect(first.results).toHaveLength(20); expect(first.nextCursor).toBe('20');
    const second = await provider.searchPage!('mars', first.nextCursor);
    expect(second.results.length).toBeGreaterThan(0);
    expect(new Set([...first.results, ...second.results].map((result) => result.id)).size).toBe(first.results.length + second.results.length);
    expect(second.nextCursor).toBeUndefined();
  });

  it('returns empty for blank/unknown queries, validates cursors and honors cancellation', async () => {
    const provider = createNasaProvider();
    expect(await provider.search('')).toEqual([]);
    expect(await provider.search('xyzzy-no-nasa-asset')).toEqual([]);
    await expect(provider.searchPage!('mars', 'https://evil.example')).rejects.toThrow('Invalid provider continuation');
    const controller = new AbortController(); controller.abort();
    await expect(provider.search('apollo', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('performs no runtime network call and exposes only honest sort capabilities', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const results = await createNasaProvider().search('apollo');
    expect(results.length).toBeGreaterThan(0); expect(request).not.toHaveBeenCalled();
    expect(canSort(results, 'best')).toBe(true);
    for (const sort of ['latest', 'popularity', 'downloads', 'rating', 'price-asc', 'price-desc'] as const) expect(canSort(results, sort)).toBe(false);
  });
});

describe('NASA central orchestration', () => {
  it('uses Expanded Search variants, deduplicates IDs, appends Load More and isolates another provider failure', async () => {
    const snapshots: SearchSnapshot[] = [];
    const runner = new SearchOrchestrator((snapshot) => snapshots.push(snapshot));
    runner.start('mars', [createNasaProvider(), { id: 'broken', search: async () => { throw new Error('isolated'); } }],
      { expandedQueries: ['mars rover', 'mars'] });
    await vi.waitFor(() => expect(snapshots.at(-1)?.states.every((state) => state.status !== 'searching')).toBe(true));
    const firstCount = snapshots.at(-1)!.results.length;
    expect(firstCount).toBeGreaterThan(0);
    expect(new Set(snapshots.at(-1)!.results.map((result) => result.id)).size).toBe(firstCount);
    expect(snapshots.at(-1)?.states.find((state) => state.providerId === 'broken')?.status).toBe('failed');
    runner.loadMore();
    await vi.waitFor(() => expect(snapshots.at(-1)!.results.length).toBeGreaterThan(firstCount));
    expect(new Set(snapshots.at(-1)!.results.map((result) => result.id)).size).toBe(snapshots.at(-1)!.results.length);
    runner.cancel();
  });
});
