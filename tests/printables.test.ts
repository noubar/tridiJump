// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrintablesProvider, normalizePrintablesPage } from '../src/providers/printables';
import { providerAvailability } from '../src/providers/availability';
import { saveCredentials } from '../src/providers/credentials';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import { mockExtensionStorage } from './helpers/extension-storage';
import { mockPrintablesRuntime } from './helpers/printables-runtime';
import { createModelCard } from '../src/results/card';
import fixture from './fixtures/printables/search.json';
import cults from './fixtures/cults3d/search.json';
import mmf from './fixtures/myminifactory/search.json';
import thingiverse from './fixtures/thingiverse/search.json';
import html from '../src/results/index.html?raw';
import settings from '../src/settings/index.html?raw';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const item = (id: number) => ({ id: String(id), name: `Fixture ${id}`, slug: `fixture-${id}` });
const batch = (items: unknown[], totalCount = items.length) => ({ data: { searchPrints2: { items, totalCount } } });
function runner() {
  let latest!: SearchSnapshot;
  const search = new SearchOrchestrator((snapshot) => { latest = snapshot; });
  return { search, latest: () => latest };
}
let storage: ReturnType<typeof mockExtensionStorage>;
let messaging: ReturnType<typeof mockPrintablesRuntime>;
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); storage = mockExtensionStorage(); messaging = mockPrintablesRuntime(); });
afterEach(() => {
  window.dispatchEvent(new Event('pagehide')); document.body.replaceChildren();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Printables request and normalization (synthetic responses; user live checkpoints recorded separately)', () => {
  it('sends only structured search inputs to the worker, whose fixed anonymous request escapes text and never loads credentials', async () => {
    for (const source of providerAvailability.filter((source) => source.classification === 'B')) {
      await saveCredentials(source.id, source.createProvider().credentialFields!, {
        nickname: 'fake-printables-boundary-user', apiKey: 'FAKE-OTHER-KEY', appToken: 'FAKE-OTHER-TOKEN',
      });
    }
    storage.local.get.mockClear();
    const request = vi.fn(async () => json(fixture)); vi.stubGlobal('fetch', request);
    const metadata = { ...providerAvailability[0], endpoint: 'https://evil.example', credentialProviderId: 'cults3d' };
    const provider = metadata.createProvider();
    expect(provider.credentialFields).toBeUndefined();
    const controller = new AbortController(); const query = 'cap " } mutation { x # \\ &';
    await provider.search(query, controller.signal);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://api.printables.com/graphql/');
    expect(messaging.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'printables.search', query, limit: 20, offset: 0 });
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
    expect([...new Headers(init!.headers).keys()].map((key) => key.toLowerCase()).sort()).toEqual(['accept', 'content-type']);
    const body = JSON.parse(init!.body as string);
    expect(body.query).toContain(`query: ${JSON.stringify(query)}`);
    expect(body.query).toContain('limit: 20, offset: 0');
    expect(body.query).toBe(`query { searchPrints2(query: ${JSON.stringify(query)}, limit: 20, offset: 0) { totalCount items { id name slug likesCount downloadCount image { filePath } } } }`);
    expect(JSON.stringify([url, init])).not.toMatch(/FAKE-OTHER|fake-printables-boundary-user/);
    expect(storage.local.get).not.toHaveBeenCalled();
  });

  it('normalizes observed fields without fabricating optional metadata', () => {
    const result = normalizePrintablesPage(fixture, 'cap');
    expect(result.results[0]).toEqual({ id: '999999981', title: 'Fixture cap', url: 'https://www.printables.com/model/999999981-fixture-cap', providerId: 'printables', query: 'cap', downloads: 42, popularity: 7, thumbnail: 'https://media.printables.com/media/prints/999999981/images/fixture-cover.webp' });
    expect(result.results[1]).toEqual({ id: '999999982', title: 'Fixture lid', url: 'https://www.printables.com/model/999999982-fixture-lid', providerId: 'printables', query: 'cap' });
    expect(result.nextCursor).toBeUndefined();
    const unverified = normalizePrintablesPage(batch([{ ...item(1), ratingAvg: '4.9', datePublished: '2026-01-01', price: null, image: { filePath: 'https://untrusted.example/guess' }, user: { name: 'guess' } }]), 'cap').results[0]!;
    for (const key of ['price', 'isFree', 'thumbnail', 'creator', 'formats', 'createdAt', 'rating']) expect(unverified).not.toHaveProperty(key);
  });

  it.each([
    undefined, null, [], 'not-an-image', {}, { filePath: undefined }, { filePath: null },
    { filePath: 42 }, { filePath: {} }, { filePath: [] }, { filePath: '' }, { filePath: '   ' },
    ...[
      'https://evil.example/cover.webp', 'https://media.printables.com/cover.webp',
      'http://evil.example/image.jpg', '//evil.example/cover.webp', '/cover.webp',
      'javascript:alert(1)', 'data:image/png;base64,FAKE', 'file:///cover.webp',
      '\\evil.example\\cover.webp', 'media\\cover.webp', 'media/../cover.webp', '../cover.webp',
      './cover.webp', 'media/./cover.webp', 'media/%2e%2e/cover.webp', 'media/%252e%252e/cover.webp',
      '%2f%2fevil.example/cover.webp', 'https%3a%2f%2fevil.example/cover.webp',
      'media/cover.webp?url=https://evil.example', 'media/cover.webp#fragment',
      'media/cover.webp%3fquery', 'media/%5ccover.webp', 'media/%00cover.webp',
      'media/cover\n.webp', ' media/cover.webp', 'media/cover.webp ', 'media/%ZZ.webp',
    ].map((filePath) => ({ filePath })),
  ])('omits invalid/missing image %j without dropping its model or pagination', (image) => {
    const page = normalizePrintablesPage(batch([{ ...item(1), image }], 2), 'cap');
    expect(page.results).toHaveLength(1); expect(page.results[0]).not.toHaveProperty('thumbnail');
    expect(page.results[0]!.url).toBe('https://www.printables.com/model/1-fixture-1');
    expect(page.nextCursor).toBe('1');
    const card = createModelCard(page.results[0]!, 'Printables');
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector<HTMLSpanElement>('.model-preview span')!.hidden).toBe(false);
    expect(card.textContent).toContain('No preview');
  });

  it('renders only the normalized cover and restores No preview when loading fails, preserving the model link', async () => {
    const request = vi.fn(async () => json(fixture)); vi.stubGlobal('fetch', request);
    const results = await createPrintablesProvider().search('cap');
    const card = createModelCard(results[0]!, 'Printables');
    const image = card.querySelector<HTMLImageElement>('img')!;
    expect(image.src).toBe('https://media.printables.com/media/prints/999999981/images/fixture-cover.webp');
    expect(image.referrerPolicy).toBe('no-referrer'); expect(image.loading).toBe('lazy');
    const link = card.querySelector<HTMLAnchorElement>('a')!;
    expect(link.href).toBe('https://www.printables.com/model/999999981-fixture-cap');
    expect(card.querySelector<HTMLSpanElement>('.model-preview span')!.hidden).toBe(true);
    image.dispatchEvent(new Event('error'));
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector<HTMLSpanElement>('.model-preview span')!.hidden).toBe(false);
    expect(card.querySelector('a')).toBe(link);
    expect(request).toHaveBeenCalledOnce(); // No image-byte fetch or per-model enrichment.
  });

  it('skips malformed entries, constrains canonical paths and preserves untrusted title text', () => {
    const results = normalizePrintablesPage(batch([
      null, {}, { ...item(2), id: '../../evil' }, { ...item(3), slug: 'https://evil.example' },
      { ...item(4), name: '   ' }, { ...item(5), name: '<img src=x onerror=alert(1)>', downloadCount: -1, likesCount: '10' },
    ]), 'cap').results;
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('<img src=x onerror=alert(1)>');
    expect(results[0]).not.toHaveProperty('downloads'); expect(results[0]).not.toHaveProperty('popularity');
    expect(() => normalizePrintablesPage(batch([{}]), 'cap')).toThrow('unexpected search response');
    expect(normalizePrintablesPage(batch([]), 'cap').results).toEqual([]);
  });

  it.each([null, {}, { data: null }, { data: { searchPrints2: { items: [], totalCount: '20' } } }, { errors: [{ message: 'UNTRUSTED-ERROR-TEXT' }], data: fixture.data }])('rejects malformed/error payload %j without exposing remote errors', (value) => {
    expect(() => normalizePrintablesPage(value, 'cap')).toThrow(/Printables/);
    try { normalizePrintablesPage(value, 'cap'); } catch (error) { expect(String(error)).not.toContain('UNTRUSTED-ERROR-TEXT'); }
  });

  it('advances by raw received count, honors totalCount and rejects URL-shaped cursors before fetch', async () => {
    const request = vi.fn().mockImplementationOnce(async () => json(batch([{}, ...Array.from({ length: 19 }, (_, n) => item(n + 1))], 21)))
      .mockImplementationOnce(async () => json(batch([item(21)], 21)));
    vi.stubGlobal('fetch', request); const provider = createPrintablesProvider();
    const first = await provider.searchPage!('cap');
    expect(first.results).toHaveLength(19); expect(first.nextCursor).toBe('20');
    const second = await provider.searchPage!('cap', first.nextCursor);
    expect(second.results).toHaveLength(1); expect(second.nextCursor).toBeUndefined();
    expect(JSON.parse(request.mock.calls[1]![1].body).query).toContain('offset: 20');
    await expect(provider.searchPage!('cap', 'https://evil.example')).rejects.toThrow('Invalid provider continuation');
    expect(request).toHaveBeenCalledTimes(2);
    expect(normalizePrintablesPage(batch([], 100), 'cap').nextCursor).toBeUndefined();
  });

  it.each([401, 403, 500])('reports HTTP %s locally without returning a false empty success or remote body', async (status) => {
    const logs = ['log', 'warn', 'error', 'info', 'debug'].map((method) => vi.spyOn(console, method as 'log'));
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'UNTRUSTED-ERROR-TEXT' }, status)));
    await expect(createPrintablesProvider().search('cap')).rejects.toThrow(/Printables/);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
  it('retrieves three bounded batches beyond 20 models, only when each page is requested', async () => {
    const request = vi.fn(async (_endpoint: string, init: RequestInit) => {
      const operation = JSON.parse(init.body as string).query as string;
      const offset = Number(operation.match(/offset: (\d+)/)![1]);
      return json(batch(Array.from({ length: Math.min(20, 45 - offset) }, (_, n) => item(offset + n + 1)), 45));
    });
    vi.stubGlobal('fetch', request); const provider = createPrintablesProvider();
    const first = await provider.searchPage!('cap');
    expect(first.results).toHaveLength(20); expect(first.nextCursor).toBe('20');
    await vi.advanceTimersByTimeAsync(0); expect(request).toHaveBeenCalledOnce();
    const second = await provider.searchPage!('cap', first.nextCursor);
    expect(second.results).toHaveLength(20); expect(second.nextCursor).toBe('40');
    const third = await provider.searchPage!('cap', second.nextCursor);
    expect(third.results).toHaveLength(5); expect(third.nextCursor).toBeUndefined();
    expect(new Set([...first.results, ...second.results, ...third.results].map((result) => result.url)).size).toBe(45);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('sanitizes transport/JSON errors and honors rate-limit backoff without automatic retries', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('UNTRUSTED-ERROR-TEXT'))
      .mockResolvedValueOnce(new Response('<html>UNTRUSTED-ERROR-TEXT</html>'))
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    vi.stubGlobal('fetch', request); const provider = createPrintablesProvider();
    await expect(provider.search('cap')).rejects.toThrow('Could not reach Printables');
    await expect(provider.search('cap')).rejects.toThrow('unreadable response');
    await expect(provider.search('cap')).rejects.toThrow('rate limit');
    await expect(provider.search('cap')).rejects.toThrow('rate limit');
    await vi.advanceTimersByTimeAsync(59_000); expect(request).toHaveBeenCalledTimes(3);
  });
  it('honors already-aborted and late-aborted requests, including transports ignoring abort', async () => {
    const controller = new AbortController(); controller.abort(); const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(createPrintablesProvider().search('cap', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    let resolve!: (value: Response) => void;
    request.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    const next = new AbortController(); const task = createPrintablesProvider().search('cap', next.signal);
    await vi.advanceTimersByTimeAsync(0);
    next.abort(); const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    resolve(json(fixture)); await rejected;
  });
});

describe('Printables through the existing orchestrator and extension entries', () => {
  it('skips a disabled anonymous provider and represents a successful empty response as no-results', async () => {
    const request = vi.fn(async () => json(batch([]))); vi.stubGlobal('fetch', request);
    const { search, latest } = runner(); const provider = createPrintablesProvider();
    search.start('cap', [provider], { disabledProviderIds: new Set(['printables']) });
    await vi.advanceTimersByTimeAsync(0); expect(request).not.toHaveBeenCalled();
    expect(latest().states[0]!.status).toBe('disabled');
    search.start('cap', [provider]); await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[0]!.status).toBe('no-results'); expect(request).toHaveBeenCalledOnce(); search.cancel();
  });
  it('deduplicates variants and pagination, limits variants to three, and loads only one further stream page per click', async () => {
    const request = vi.fn(async () => json(batch([item(1)], 10))); vi.stubGlobal('fetch', request);
    const { search, latest } = runner();
    search.start('cap', [createPrintablesProvider()], { expandedQueries: ['cap', 'lid', 'Kappe', 'Deckel', 'extra', 'lid'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(4); expect(latest().results).toHaveLength(1);
    search.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(5); expect(latest().results).toHaveLength(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[4]![1]!.body as string).query).toContain('offset: 1');
    search.cancel();
  });
  it('cancels superseded requests and prevents stale responses entering the new search', async () => {
    const pending: { resolve: (response: Response) => void; signal?: AbortSignal | null }[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve) => pending.push({ resolve, signal: init.signal }))));
    const { search, latest } = runner(); const provider = createPrintablesProvider();
    search.start('cap', [provider]); await vi.advanceTimersByTimeAsync(0);
    search.start('bolt', [provider]); await vi.advanceTimersByTimeAsync(0);
    // Worker fetch may finish; the cancelled client and run guards discard it.
    expect(pending[0]!.signal).toBeUndefined();
    pending[1]!.resolve(json(batch([item(2)]))); pending[0]!.resolve(json(batch([item(1)])));
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results.map((result) => result.id)).toEqual(['2']); expect(latest().results[0]!.query).toBe('bolt'); search.cancel();
  });
  it('isolates a timed-out Printables request while a companion succeeds', async () => {
    const request = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal('fetch', request);
    const { search, latest } = runner();
    search.start('cap', [createPrintablesProvider(), { id: 'companion', search: async () => [] }], { timeoutMs: 30 });
    await vi.advanceTimersByTimeAsync(30);
    expect(latest().states.map((state) => state.status)).toEqual(['timed-out', 'no-results']);
    expect(vi.mocked(fetch).mock.calls[0]![1]!.signal).toBeUndefined(); search.cancel();
  });
  it('discards an old Load more reply and keeps the new query continuation independent', async () => {
    const pending: { operation: string; resolve: (response: Response) => void }[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve) => {
      pending.push({ operation: JSON.parse(init.body as string).query, resolve });
    })));
    const { search, latest } = runner(); const provider = createPrintablesProvider();
    search.start('cap', [provider]); await vi.advanceTimersByTimeAsync(0);
    pending[0]!.resolve(json(batch([item(1)], 2))); await vi.advanceTimersByTimeAsync(0);
    search.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(pending[1]!.operation).toContain('query: "cap", limit: 20, offset: 1');
    search.start('bolt', [provider]); await vi.advanceTimersByTimeAsync(0);
    pending[2]!.resolve(json(batch([item(3)], 2))); pending[1]!.resolve(json(batch([item(2)], 2)));
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results.map((result) => result.id)).toEqual(['3']);
    expect(latest().pages![0]!.hasMore).toBe(true);
    search.loadMore(); await vi.advanceTimersByTimeAsync(0);
    expect(pending[3]!.operation).toContain('query: "bolt", limit: 20, offset: 1');
    pending[3]!.resolve(json(batch([item(4)], 2))); await vi.advanceTimersByTimeAsync(0);
    expect(latest().results.map((result) => result.id)).toEqual(['3', '4']);
    expect(latest().pages![0]!.hasMore).toBe(false); search.cancel();
  });

  it('production Results renders safe cards progressively and loads a second batch without credentials', async () => {
    let resolve!: (response: Response) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }))
      .mockImplementationOnce(async () => json(batch([item(2)], 2)));
    vi.stubGlobal('fetch', request);
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
    window.history.replaceState(null, '', '/src/results/index.html?q=cap'); await import('../src/results/main');
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('#provider-status')!.textContent).toContain('Printables: searching');
    expect(document.querySelectorAll('.model-card')).toHaveLength(0);
    resolve(json(batch([{ ...item(1), name: '<script>untrusted()</script>' }], 2))); await vi.advanceTimersByTimeAsync(0);
    const first = document.querySelector('.model-card'); expect(first).not.toBeNull();
    expect(first!.textContent).toContain('<script>untrusted()</script>'); expect(first!.querySelector('script')).toBeNull();
    expect(first!.querySelector<HTMLAnchorElement>('a')!.href).toBe('https://www.printables.com/model/1-fixture-1');
    expect(document.querySelector('#provider-status')!.textContent).toContain('Cults3D: Setup required');
    document.querySelector<HTMLButtonElement>('#load-more')!.click(); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('.model-card')).toHaveLength(2); expect(document.querySelector('.model-card')).toBe(first);
    expect(document.querySelector<HTMLButtonElement>('#load-more')!.hidden).toBe(true); expect(request).toHaveBeenCalledTimes(2);
    expect(document.querySelector('#native-searches [data-provider-id="printables"]')).not.toBeNull();
  });
  it.each(['http', 'graphql'])('production Results isolates a Printables %s rejection while all three authenticated adapters return cards', async (kind) => {
    for (const source of providerAvailability.filter((source) => source.classification === 'B')) await saveCredentials(source.id, source.createProvider().credentialFields!, { nickname: 'test', apiKey: 'FAKE-ISOLATION-KEY', appToken: 'FAKE-ISOLATION-TOKEN' });
    vi.stubGlobal('fetch', vi.fn(async (endpoint: string) => {
      const origin = new URL(endpoint).origin;
      if (origin === 'https://api.printables.com') return kind === 'http' ? json({}, 403) : json({ errors: [{ message: 'UNTRUSTED-ERROR-TEXT' }] });
      return json(origin === 'https://cults3d.com' ? cults : origin === 'https://api.thingiverse.com' ? thingiverse : mmf);
    }));
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
    window.history.replaceState(null, '', '/src/results/index.html?q=cap'); await import('../src/results/main'); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('#provider-status')!.textContent).toContain('Printables: failed');
    expect(document.querySelectorAll('.model-card')).toHaveLength(6); expect(fetch).toHaveBeenCalledTimes(4);
    for (const name of ['Thingiverse', 'MyMiniFactory', 'Cults3D']) expect(document.querySelector('#provider-status')!.textContent).toContain(`${name}: success`);
  });
  it('Settings offers an enabled/disabled anonymous source without any credential form or configuration reads', async () => {
    document.body.innerHTML = settings.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
    await import('../src/settings/main'); await vi.advanceTimersByTimeAsync(0);
    const toggle = document.querySelector<HTMLInputElement>('#repository-printables')!;
    expect(toggle.checked).toBe(true); expect(toggle.disabled).toBe(false);
    expect(toggle.closest('li')!.textContent).toContain('cover previews live verified by the user');
    expect(document.querySelector('[id^="credential-printables"]')).toBeNull();
    expect(storage.local.get.mock.calls.some(([key]) => key === 'tridijump.credentials.printables')).toBe(false);
    toggle.checked = false; toggle.dispatchEvent(new Event('change')); await vi.advanceTimersByTimeAsync(0);
    expect(storage.data['tridijump.repositories']).toEqual({ printables: false });
  });
});
