// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../src/results/index.html?raw';
import { providerAvailability } from '../src/providers/availability';
import type { Provider, ResultPage } from '../src/providers/provider';
import { saveCredentials, clearCredentials, SetupRequired } from '../src/providers/credentials';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import type { ModelResult } from '../src/shared/model-result';
import { createResultsView } from '../src/results/view';
import { mockExtensionStorage } from './helpers/extension-storage';
import { nextOffset, nextPage, pageNumber } from '../src/providers/pagination';

const sources = providerAvailability.filter((source) => source.classification === 'B');
const origins: Record<string, string> = { cults3d: 'https://cults3d.com', thingiverse: 'https://api.thingiverse.com', myminifactory: 'https://www.myminifactory.com' };
const fake = { nickname: 'pagination-test-user', apiKey: 'FAKE-PAGINATION-KEY', appToken: 'FAKE-PAGINATION-TOKEN' };
const model = (id: string, number: number, query = 'cap'): ModelResult => ({ id: String(number), providerId: id, title: `${id} ${number}`, url: `https://example.test/${id}/${number}`, query });
const body = (id: string, start: number, count: number, total?: number) => {
  const items = Array.from({ length: count }, (_, i) => {
    const n = start + i;
    if (id === 'cults3d') return { name: `Cap ${n}`, url: `https://cults3d.com/en/3d-model/tool/cap-${n}`, price: { cents: n % 20 < 8 ? 0 : 100 } };
    if (id === 'thingiverse') return { id: n, name: `Cap ${n}`, public_url: `https://www.thingiverse.com/thing:${n}` };
    return { id: n, name: `Cap ${n}`, url: `https://www.myminifactory.com/object/cap-${n}` };
  });
  return id === 'cults3d' ? { data: { creationsSearchBatch: { results: items, total } } }
    : id === 'thingiverse' ? { hits: items, total } : { items, total_count: total };
};
function requestPosition(endpoint: string, options?: RequestInit) {
  const url = new URL(endpoint);
  const id = sources.find((source) => origins[source.id] === url.origin)!.id;
  return { id, offset: id === 'cults3d' ? Number(JSON.parse(options!.body as string).variables.offset ?? 0) : (Number(url.searchParams.get('page')) - 1) * 20 };
}
async function configure() {
  for (const source of sources) await saveCredentials(source.id, source.createProvider().credentialFields!, fake);
}
function setup() {
  const updates: SearchSnapshot[] = [];
  const runner = new SearchOrchestrator((snapshot) => updates.push(snapshot));
  return { runner, updates, latest: () => updates.at(-1)! };
}
function controlled(id: string) {
  const requests: { query: string; cursor?: string; signal?: AbortSignal; resolve: (page: ResultPage) => void; reject: (error: Error) => void }[] = [];
  const searchPage = vi.fn((query: string, cursor?: string, signal?: AbortSignal) => new Promise<ResultPage>((resolve, reject) => requests.push({ query, cursor, signal, resolve, reject })));
  return { id, requests, searchPage, search: async () => [] } satisfies Provider & { requests: typeof requests };
}
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mockExtensionStorage(); document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!; });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe.each(sources)('$name incremental adapter', (source) => {
  it('returns 20 + continuation, advances through a third page, and exhausts without page 1 refetch', async () => {
    await configure();
    const request = vi.fn(async (url: string, options: RequestInit) => {
      const { id, offset } = requestPosition(url, options);
      return new Response(JSON.stringify(body(id, offset, Math.min(20, 45 - offset), 45)));
    });
    vi.stubGlobal('fetch', request);
    const provider = source.createProvider();
    const first = await provider.searchPage!('cap');
    expect(first.results).toHaveLength(20);
    expect(first.nextCursor).toBeDefined();
    const second = await provider.searchPage!('cap', first.nextCursor);
    expect(second.results).toHaveLength(20);
    const third = await provider.searchPage!('cap', second.nextCursor);
    expect(third.results).toHaveLength(5);
    expect(third.nextCursor).toBeUndefined();
    expect(request.mock.calls.map(([url, options]) => requestPosition(url, options).offset)).toEqual([0, 20, 40]);
    expect(new Set([...first.results, ...second.results, ...third.results].map((result) => result.url)).size).toBe(45);
  });
  it('uses raw counts despite malformed records, handles absent totals, and rejects URL-shaped cursors before fetch', async () => {
    await configure();
    const payload = body(source.id, 0, 20);
    const records = 'items' in payload ? payload.items : 'hits' in payload ? payload.hits : payload.data.creationsSearchBatch.results;
    records![0] = null as never;
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', request);
    const provider = source.createProvider();
    const page = await provider.searchPage!('cap');
    expect(page.results).toHaveLength(19);
    expect(page.nextCursor).toBeDefined();
    await expect(provider.searchPage!('cap', 'https://evil.example/key')).rejects.toThrow('Invalid provider continuation');
    expect(request).toHaveBeenCalledOnce();
  });
  it('rechecks credentials for additional pages and maps removal to setup-required', async () => {
    await configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body(source.id, 0, 20, 100)))));
    const provider = source.createProvider();
    const first = await provider.searchPage!('cap');
    await clearCredentials(source.id);
    await expect(provider.searchPage!('cap', first.nextCursor)).rejects.toBeInstanceOf(SetupRequired);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('incremental orchestration', () => {
  it('does not mistake a duplicate-only page for exhaustion when another continuation exists', async () => {
    const source = controlled('test'); const { runner, latest } = setup();
    runner.start('cap', [source]); await vi.advanceTimersByTimeAsync(0);
    source.requests[0]!.resolve({ results: [model('test', 1)], nextCursor: 'second' }); await vi.advanceTimersByTimeAsync(0);
    runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    source.requests[1]!.resolve({ results: [model('test', 1)], nextCursor: 'third' }); await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(1); expect(latest().pages?.[0]?.hasMore).toBe(true);
    runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(source.requests[2]?.cursor).toBe('third');
    source.requests[2]!.resolve({ results: [model('test', 2)] }); await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(2); runner.cancel();
  });
  it('appends each provider immediately, retains independent continuations and skips exhausted providers', async () => {
    const a = controlled('a'); const b = controlled('b'); const { runner, latest } = setup();
    runner.start('cap', [a, b]); await vi.advanceTimersByTimeAsync(0);
    a.requests[0]!.resolve({ results: [model('a', 1)], nextCursor: 'a-next' });
    b.requests[0]!.resolve({ results: [model('b', 1)], nextCursor: 'b-next' });
    await vi.advanceTimersByTimeAsync(0); runner.loadMore(); runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(a.requests).toHaveLength(2); expect(b.requests).toHaveLength(2);
    expect(a.requests[1]?.cursor).toBe('a-next'); expect(b.requests[1]?.cursor).toBe('b-next');
    a.requests[1]!.resolve({ results: [model('a', 1), model('a', 2)] });
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(3);
    expect(latest().states.find((state) => state.providerId === 'b')?.status).toBe('searching');
    b.requests[1]!.resolve({ results: [model('b', 2)], nextCursor: 'b-third' });
    await vi.advanceTimersByTimeAsync(0); runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(a.requests).toHaveLength(2); expect(b.requests[2]?.cursor).toBe('b-third');
    b.requests[2]!.resolve({ results: [] }); await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(4); expect(latest().pages?.every((page) => !page.hasMore)).toBe(true);
    runner.loadMore(); await vi.advanceTimersByTimeAsync(0); expect(b.requests).toHaveLength(3);
    runner.cancel();
  });
  it('isolates page failure, preserves cards, and retries that continuation while other providers progress', async () => {
    await configure(); let rejectSecond = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      const { id, offset } = requestPosition(url, options);
      if (id === 'thingiverse' && offset === 20 && rejectSecond) return new Response('', { status: 500 });
      return new Response(JSON.stringify(body(id, offset, Math.min(20, 45 - offset), 45)));
    }));
    const { runner, latest } = setup(); runner.start('cap', sources.map((source) => source.createProvider()));
    await vi.advanceTimersByTimeAsync(0); runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(100);
    expect(latest().states.find((state) => state.providerId === 'thingiverse')?.status).toBe('failed');
    expect(latest().states.filter((state) => state.status === 'success')).toHaveLength(2);
    rejectSecond = false; runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(130);
    runner.loadMore(); await vi.advanceTimersByTimeAsync(0); expect(latest().results).toHaveLength(135);
    runner.cancel();
  });
  it('never dispatches disabled or setup-required providers during loading, including newly disabled sources', async () => {
    const disabled = controlled('disabled'); const active = controlled('active');
    const setupSearch = vi.fn(async () => { throw new SetupRequired(); });
    const { runner, latest } = setup();
    runner.start('cap', [disabled, active, { id: 'setup', search: async () => [], searchPage: setupSearch }], { disabledProviderIds: new Set(['disabled']), expandedQueries: ['lid', 'Kappe', 'Deckel'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(setupSearch).toHaveBeenCalledOnce(); expect(disabled.searchPage).not.toHaveBeenCalled();
    active.requests[0]!.resolve({ results: [model('active', 1)], nextCursor: 'next' });
    await vi.advanceTimersByTimeAsync(0);
    // Finish the three configured variant first pages, never any subsequent page automatically.
    for (let i = 1; i < 4; i++) { active.requests[i]!.resolve({ results: [] }); await vi.advanceTimersByTimeAsync(0); }
    runner.loadMore(new Set(['disabled', 'active'])); await vi.advanceTimersByTimeAsync(0);
    expect(active.requests).toHaveLength(4); expect(setupSearch).toHaveBeenCalledOnce();
    expect(latest().states.find((state) => state.providerId === 'setup')?.status).toBe('setup-required');
    runner.cancel();
  });
  it('aborts old pagination and ignores late results after a new search, even for an adapter ignoring abort', async () => {
    const source = controlled('test'); const { runner, latest } = setup();
    runner.start('cap', [source]); await vi.advanceTimersByTimeAsync(0);
    source.requests[0]!.resolve({ results: [model('test', 1)], nextCursor: 'next' });
    await vi.advanceTimersByTimeAsync(0); runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    runner.start('bolt', [source]); await vi.advanceTimersByTimeAsync(0);
    expect(source.requests[1]?.signal?.aborted).toBe(true);
    source.requests[2]!.resolve({ results: [model('test', 3, 'bolt')] });
    source.requests[1]!.resolve({ results: [model('test', 2)], nextCursor: 'stale' });
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().query).toBe('bolt'); expect(latest().results.map((result) => result.id)).toEqual(['3']);
    expect(latest().pages?.[0]?.hasMore).toBe(false); runner.cancel();
  });
  it('bounds/deduplicates variant first pages, shares model identities, and loads one stream page per click', async () => {
    const source = controlled('test'); const { runner, latest } = setup();
    runner.start('cap', [source], { expandedQueries: ['cap', 'lid', 'Kappe', 'Deckel', 'too many', 'lid'] });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) {
      const duplicate = { ...model('test', 1), query: source.requests[i]!.query };
      if (i === 2) delete duplicate.id;
      source.requests[i]!.resolve({ results: [duplicate], nextCursor: 'page-2' });
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(source.requests.map((request) => request.query)).toEqual(['cap', 'lid', 'Kappe', 'Deckel']);
    expect(latest().results).toHaveLength(1);
    runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(source.requests).toHaveLength(5); expect(source.requests[4]?.query).toBe('cap');
    source.requests[4]!.resolve({ results: [model('test', 2)], nextCursor: 'page-3' });
    await vi.advanceTimersByTimeAsync(0); runner.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(source.requests).toHaveLength(6); expect(source.requests[5]?.query).toBe('lid');
    source.requests[5]!.resolve({ results: [model('test', 2)], nextCursor: 'page-3' });
    await vi.advanceTimersByTimeAsync(0); expect(latest().results).toHaveLength(2); runner.cancel();
  });
  it('times out only a pending page and preserves external cancellation after the first page', async () => {
    const source = controlled('test'); const external = new AbortController(); const { runner, latest } = setup();
    runner.start('cap', [source], { timeoutMs: 50, signal: external.signal }); await vi.advanceTimersByTimeAsync(0);
    source.requests[0]!.resolve({ results: [model('test', 1)], nextCursor: 'next' }); await vi.advanceTimersByTimeAsync(0);
    runner.loadMore(); await vi.advanceTimersByTimeAsync(50);
    expect(latest().states[0]?.status).toBe('timed-out'); expect(latest().results).toHaveLength(1);
    runner.loadMore(); await vi.advanceTimersByTimeAsync(0); external.abort();
    expect(source.requests[2]?.signal?.aborted).toBe(true);
    source.requests[2]!.resolve({ results: [model('test', 2)] }); await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(1); expect(latest().pages?.[0]?.hasMore).toBe(false);
  });
});

describe('loaded-result filters and counts', () => {
  it('rechecks disabled repositories on Load more and does not paginate a source disabled since its initial search', async () => {
    const source = controlled('test');
    const readDisabledProviders = vi.fn().mockResolvedValue(new Set(['test']));
    const view = createResultsView(document.querySelector('main')!, [{ name: 'Test', provider: source }], { readDisabledProviders });
    view.search('cap'); await vi.advanceTimersByTimeAsync(0);
    source.requests[0]!.resolve({ results: [model('test', 1)], nextCursor: 'next' }); await vi.advanceTimersByTimeAsync(0);
    document.querySelector<HTMLButtonElement>('#load-more')!.click(); await vi.advanceTimersByTimeAsync(0);
    expect(readDisabledProviders).toHaveBeenCalledOnce(); expect(source.requests).toHaveLength(1);
    expect(document.querySelector('#provider-status [data-status="disabled"]')).not.toBeNull();
    expect(document.querySelectorAll('.model-card')).toHaveLength(1); view.cancel();
  });
  it('does not apply a delayed Load more settings read to a newer search', async () => {
    const source = controlled('test'); let resolveSettings!: (value: ReadonlySet<string>) => void;
    const view = createResultsView(document.querySelector('main')!, [{ name: 'Test', provider: source }], {
      readDisabledProviders: () => new Promise((resolve) => { resolveSettings = resolve; }),
    });
    view.search('cap'); await vi.advanceTimersByTimeAsync(0);
    source.requests[0]!.resolve({ results: [model('test', 1)], nextCursor: 'next' }); await vi.advanceTimersByTimeAsync(0);
    document.querySelector<HTMLButtonElement>('#load-more')!.click();
    view.search('bolt'); await vi.advanceTimersByTimeAsync(0);
    source.requests[1]!.resolve({ results: [model('test', 2, 'bolt')], nextCursor: 'bolt-next' }); await vi.advanceTimersByTimeAsync(0);
    resolveSettings(new Set()); await vi.advanceTimersByTimeAsync(0);
    expect(source.requests).toHaveLength(2); expect(document.querySelectorAll('.model-card')).toHaveLength(1); view.cancel();
  });
  it('starts with 60 loaded, keeps unknown prices out of Free and loads additional Free models without clearing cards', async () => {
    await configure();
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      const { id, offset } = requestPosition(url, options);
      return new Response(JSON.stringify(body(id, offset, 20, 40)));
    }));
    const view = createResultsView(document.querySelector('main')!, sources.map((source) => ({ name: source.name, provider: source.createProvider() })));
    view.search('cap'); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('.model-card')).toHaveLength(60);
    const free = document.querySelector<HTMLSelectElement>('#price')!; free.value = 'free'; free.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.model-card')).toHaveLength(28);
    expect(document.querySelector('#result-count')!.textContent).toContain('28 matching');
    expect(document.querySelector('#result-count')!.textContent).toContain('60 loaded');
    const first = document.querySelector('.model-card'); const button = document.querySelector<HTMLButtonElement>('#load-more')!;
    expect(button.hidden).toBe(false); button.click(); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('.model-card')).toHaveLength(56);
    expect(document.querySelector('.model-card')).toBe(first);
    expect(document.querySelector('#result-count')!.textContent).toContain('120 loaded');
    expect(button.hidden).toBe(true); expect(fetch).toHaveBeenCalledTimes(6); view.cancel();
  });
});

it('honors reliable totals and raw offsets without inventing totals or fetching known-empty pages', () => {
  expect(nextPage(1, 20, 20)).toBeUndefined(); expect(nextPage(1, 20, undefined)).toBe('2');
  expect(nextPage(2, 0, 100)).toBeUndefined(); expect(nextPage(1, 2, '100')).toBeUndefined();
  expect(nextOffset(0, 10, 100)).toBe('10'); expect(nextOffset(10, 10, 20)).toBeUndefined();
  expect(() => pageNumber('https://evil.example')).toThrow();
});
