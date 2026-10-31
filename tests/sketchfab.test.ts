// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchOrchestrator, type SearchSnapshot } from '../src/search/orchestrator';
import { canSort } from '../src/results/result-options';
import { createSketchfabProvider, normalizeSketchfabPage, selectSketchfabThumbnail, sketchfabSearchUrl } from '../src/providers/sketchfab';
import type { Provider } from '../src/providers/provider';
import fixture from './fixtures/sketchfab/search.json';

afterEach(() => vi.unstubAllGlobals());

describe('Sketchfab Data API v3 adapter', () => {
  it('constructs an anonymous, encoded, fixed-origin search request', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ results: [], next: null, cursors: { next: null } })));
    vi.stubGlobal('fetch', fetcher);
    await createSketchfabProvider().search('gear & <model>');
    const [rawUrl, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(rawUrl));
    expect(url.origin + url.pathname).toBe('https://api.sketchfab.com/v3/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ type: 'models', q: 'gear & <model>' });
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(JSON.stringify(init)).not.toMatch(/authorization|bearer|token/i);
  });

  it('normalizes supported fields while keeping price, formats, downloads and rating unknown', () => {
    const page = normalizeSketchfabPage(fixture, 'benchy');
    expect(page.nextCursor).toBe('24');
    expect(page.results[0]).toEqual({
      providerId: 'sketchfab', id: '11111111111111111111111111111111', title: 'Fixture Benchy', query: 'benchy',
      url: 'https://sketchfab.com/3d-models/fixture-benchy-11111111111111111111111111111111',
      thumbnail: 'https://media.sketchfab.com/models/fixture/448.jpeg', creator: 'fixture-creator',
      publishedAt: '2026-01-02T03:04:05.000Z', popularity: 17, views: 230, comments: 4,
      isDownloadable: true, license: 'CC Attribution',
    });
    expect(page.results[0]).not.toHaveProperty('isFree');
    expect(page.results[0]).not.toHaveProperty('price');
    expect(page.results[0]).not.toHaveProperty('formats');
    expect(page.results[0]).not.toHaveProperty('downloads');
    expect(page.results[0]).not.toHaveProperty('rating');
    expect(page.results[1]).toEqual({ providerId: 'sketchfab', id: '22222222222222222222222222222222',
      title: 'Fixture Minimal Model', url: 'https://sketchfab.com/3d-models/fixture-minimal-22222222222222222222222222222222', query: 'benchy' });
  });

  it('chooses a deterministic useful thumbnail and rejects untrusted media URLs', () => {
    expect(selectSketchfabThumbnail({ images: [
      { url: 'https://evil.test/models/a.jpeg', width: 448, height: 200 },
      { url: 'https://media.sketchfab.com/models/a/900.jpeg', width: 900, height: 400 },
      { url: 'https://media.sketchfab.com/models/a/448.jpeg', width: 448, height: 200 },
    ] })).toBe('https://media.sketchfab.com/models/a/448.jpeg');
    expect(selectSketchfabThumbnail({ images: [{ url: 'javascript:alert(1)', width: 448, height: 200 }] })).toBeUndefined();
  });

  it('uses the opaque cursor on load more without following the response URL', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetcher);
    const page = await createSketchfabProvider().searchPage!('benchy', '24');
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('cursor')).toBe('24');
    expect(page.nextCursor).toBe('24');
    expect(() => normalizeSketchfabPage({ ...fixture, next: 'https://evil.test/v3/search?type=models&q=benchy&cursor=24' }, 'benchy'))
      .toThrow('invalid pagination');
    expect(() => sketchfabSearchUrl('benchy', '24&redirect=https://evil.test')).toThrow('Invalid Sketchfab continuation');
  });

  it('handles empty, malformed and unusable responses honestly', () => {
    expect(normalizeSketchfabPage({ results: [], next: null }, 'empty')).toEqual({ results: [], nextCursor: undefined });
    expect(() => normalizeSketchfabPage({}, 'x')).toThrow('unexpected search response');
    expect(() => normalizeSketchfabPage({ results: [{ uid: 'bad', name: '<script>', viewerUrl: 'javascript:alert(1)' }] }, 'x'))
      .toThrow('no usable model records');
  });

  it.each([
    [400, 'rejected'], [401, 'denied anonymous'], [403, 'denied anonymous'], [404, 'unavailable'], [429, 'rate limit'], [500, 'HTTP 500'],
  ])('maps HTTP %i to a useful isolated error', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status, headers: status === 429 ? { 'Retry-After': '1' } : {} })));
    await expect(createSketchfabProvider().search('car')).rejects.toThrow(message);
  });

  it('honors cancellation before and during a request', async () => {
    const before = new AbortController(); before.abort();
    await expect(createSketchfabProvider().search('car', before.signal)).rejects.toMatchObject({ name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const during = new AbortController();
    const pending = createSketchfabProvider().search('car', during.signal); during.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('supports honest local sorts from reported metadata only', () => {
    const models = normalizeSketchfabPage(fixture, 'benchy').results;
    expect(canSort(models, 'best')).toBe(true);
    expect(canSort(models, 'latest')).toBe(false);
    expect(canSort(models, 'popularity')).toBe(false);
    for (const sort of ['downloads', 'rating', 'price-asc', 'price-desc'] as const) expect(canSort(models, sort)).toBe(false);
  });
});

describe('Sketchfab orchestration', () => {
  it('appends cursor pages, suppresses duplicates and isolates another provider failure', async () => {
    const provider = createSketchfabProvider();
    const fetcher = vi.fn(async (rawUrl: string) => {
      const cursor = new URL(rawUrl).searchParams.get('cursor');
      return new Response(JSON.stringify(cursor ? { results: [fixture.results[0], { ...fixture.results[1], uid: '33333333333333333333333333333333', name: 'Page two', viewerUrl: 'https://sketchfab.com/3d-models/page-two-33333333333333333333333333333333' }], next: null, cursors: { next: null } } : fixture));
    });
    vi.stubGlobal('fetch', fetcher);
    const snapshots: SearchSnapshot[] = [];
    const failing: Provider = { id: 'broken', search: async () => { throw new Error('isolated'); } };
    const orchestrator = new SearchOrchestrator((snapshot) => snapshots.push(snapshot));
    orchestrator.start('benchy', [provider, failing]);
    await vi.waitFor(() => expect(snapshots.at(-1)?.states.find((state) => state.providerId === 'sketchfab')?.status).toBe('success'));
    orchestrator.loadMore();
    await vi.waitFor(() => expect(snapshots.at(-1)?.results).toHaveLength(3));
    expect(snapshots.at(-1)?.states.find((state) => state.providerId === 'broken')?.status).toBe('failed');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('runs bounded expanded terms progressively through the provider', async () => {
    const queries: string[] = [];
    const provider: Provider = { id: 'sketchfab', search: async (query) => { queries.push(query); return []; } };
    const snapshots: SearchSnapshot[] = [];
    new SearchOrchestrator((snapshot) => snapshots.push(snapshot)).start('car', [provider], { expandedQueries: ['automobile', 'vehicle', 'car'] });
    await vi.waitFor(() => expect(queries).toEqual(['car', 'automobile', 'vehicle']));
    expect(snapshots.at(-1)?.states[0]?.status).toBe('no-results');
  });
});
