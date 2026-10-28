// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMyMiniFactoryProvider, myMiniFactoryCredentialFields, normalizeMyMiniFactoryResults } from '../src/providers/myminifactory';
import { createThingiverseProvider, thingiverseCredentialFields, normalizeThingiverseResults } from '../src/providers/thingiverse';
import { clearCredentials, saveCredentials } from '../src/providers/credentials';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import { mockExtensionStorage } from './helpers/extension-storage';
import mmf from './fixtures/myminifactory/search.json';
import thingiverse from './fixtures/thingiverse/search.json';

const cases = [
  { id: 'myminifactory', make: createMyMiniFactoryProvider, fields: myMiniFactoryCredentialFields,
    values: { apiKey: 'FAKE-MMF-KEY' } as Record<string, string>, secret: 'FAKE-MMF-KEY', fixture: mmf, empty: { items: [] }, normalize: normalizeMyMiniFactoryResults },
  { id: 'thingiverse', make: createThingiverseProvider, fields: thingiverseCredentialFields,
    values: { appToken: 'FAKE-THINGIVERSE-TOKEN' } as Record<string, string>, secret: 'FAKE-THINGIVERSE-TOKEN', fixture: thingiverse, empty: { hits: [] }, normalize: normalizeThingiverseResults },
];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function setup() {
  const updates: SearchSnapshot[] = [];
  return { runner: new SearchOrchestrator((update) => updates.push(update)), latest: () => updates.at(-1)!, updates };
}

describe.each(cases)('$id documented user-key API', (source) => {
  it('maps missing configuration to setup-required without a request or affecting a companion provider', async () => {
    mockExtensionStorage();
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { runner, latest } = setup();
    runner.start('cap', [source.make(), { id: 'companion', async search() { return []; } }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states).toEqual([{ providerId: source.id, status: 'setup-required' }, { providerId: 'companion', query: 'cap', status: 'no-results' }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('constructs a bounded request to only its provider, with correct auth, encoding, and cancellation', async () => {
    mockExtensionStorage();
    await saveCredentials(source.id, source.fields, source.values);
    const fetchMock = vi.fn().mockResolvedValue(json(source.fixture)); vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const results = await source.make().search('  cap & / café?  ', controller.signal);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.providerId === source.id && result.query === 'cap & / café?')).toBe(true);
    const [endpoint, options] = fetchMock.mock.calls[0]!;
    const url = new URL(endpoint);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('per_page')).toBe('20');
    if (source.id === 'myminifactory') {
      expect(url.origin).toBe('https://www.myminifactory.com');
      expect(url.pathname).toBe('/api/v2/search');
      expect(url.searchParams.get('q')).toBe('cap & / café?');
      expect(url.searchParams.get('key')).toBe(source.secret);
      expect(options.headers.Authorization).toBeUndefined();
    } else {
      expect(url.origin).toBe('https://api.thingiverse.com');
      expect(decodeURIComponent(url.pathname.slice('/search/'.length))).toBe('cap & / café?');
      expect(url.href).not.toContain(source.secret);
      expect(options.headers.Authorization).toBe(`Bearer ${source.secret}`);
    }
    expect(options).toMatchObject({ method: 'GET', signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
    expect(options.body).toBeUndefined();
    expect(JSON.stringify(results)).not.toContain(source.secret);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([401, 403])('isolates HTTP %i auth failure and never exposes remote secret echoes', async (status) => {
    mockExtensionStorage();
    await saveCredentials(source.id, source.fields, source.values);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: `secret echo ${source.secret}` }, status)));
    const { runner, latest, updates } = setup();
    runner.start('cap', [source.make(), { id: 'companion', async search() { return [{ title: 'Other', providerId: 'companion', url: 'https://example.test/model' }]; } }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('Check your') });
    expect(latest().states[1]?.status).toBe('success');
    expect(latest().results).toHaveLength(1);
    expect(JSON.stringify(updates)).not.toContain(source.secret);
    expect(JSON.stringify(updates)).not.toContain('secret echo');
  });

  it('returns to setup-required on the next search after local removal', async () => {
    mockExtensionStorage();
    await saveCredentials(source.id, source.fields, source.values);
    const fetchMock = vi.fn().mockResolvedValue(json(source.fixture)); vi.stubGlobal('fetch', fetchMock);
    const provider = source.make();
    const { runner, latest } = setup();
    runner.start('before', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[0]?.status).toBe('success');
    await clearCredentials(source.id);
    runner.start('after', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states).toEqual([{ providerId: source.id, status: 'setup-required' }]);
    expect(latest().results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('handles valid empty data and rejects malformed envelopes without invented values', async () => {
    expect(source.normalize(source.empty, 'cap')).toEqual([]);
    for (const payload of [null, [], {}, { error: source.secret }]) expect(() => source.normalize(payload, 'cap')).toThrow('unexpected');
    const [full, minimal] = source.normalize(source.fixture, 'cap');
    expect(full?.popularity).toBe(0);
    expect(minimal).toEqual({ title: expect.any(String), url: expect.any(String), providerId: source.id, query: 'cap' });
    for (const result of [full, minimal]) {
      expect(result).not.toHaveProperty('price');
      expect(result).not.toHaveProperty('isFree');
      expect(result).not.toHaveProperty('rating');
    }
  });

  it('cancels before fetch, during credential reads, and in-flight', async () => {
    const { local } = mockExtensionStorage();
    await saveCredentials(source.id, source.fields, source.values);
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error(source.secret)), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const before = new AbortController(); before.abort();
    await expect(source.make().search('cap', before.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(local.get).not.toHaveBeenCalled();
    let resolveRead!: (value: Record<string, unknown>) => void;
    local.get.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const duringRead = new AbortController();
    const pendingRead = source.make().search('cap', duringRead.signal);
    duringRead.abort();
    resolveRead({ [`tridijump.credentials.${source.id}`]: source.values });
    await expect(pendingRead).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    const duringFetch = new AbortController();
    const pending = source.make().search('cap', duringFetch.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    duringFetch.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not leak a request URL/token from network or body parsing errors', async () => {
    mockExtensionStorage();
    await saveCredentials(source.id, source.fields, source.values);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error(`URL included ${source.secret}`))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.reject(new Error(source.secret)) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(source.make().search('cap')).rejects.toThrow('Could not reach');
    await expect(source.make().search('cap')).rejects.toThrow('unreadable');
  });

  it('honors 429 without retrying, even on another explicit search during cooldown', async () => {
    mockExtensionStorage();
    await saveCredentials(source.id, source.fields, source.values);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(json(source.fixture));
    vi.stubGlobal('fetch', fetchMock);
    const provider = source.make();
    await expect(provider.search('cap')).rejects.toThrow('rate limit');
    await expect(provider.search('cap')).rejects.toThrow('rate limit');
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(provider.search('cap')).resolves.toHaveLength(2);
  });

  it('honors a Retry-After HTTP date longer than the default cooldown', async () => {
    mockExtensionStorage();
    await saveCredentials(source.id, source.fields, source.values);
    const until = new Date(Date.now() + 120_000).toUTCString();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': until } }))
      .mockResolvedValueOnce(json(source.fixture));
    vi.stubGlobal('fetch', fetchMock);
    const provider = source.make();
    await expect(provider.search('cap')).rejects.toThrow('rate limit');
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(provider.search('cap')).rejects.toThrow('rate limit');
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(provider.search('cap')).resolves.toHaveLength(2);
  });
});

describe('provider-specific optional data', () => {
  it('uses reported MMF file extensions, omits publication as creation, and skips malformed fields', () => {
    const [result] = normalizeMyMiniFactoryResults(mmf, 'cap');
    expect(result?.formats).toEqual(['stl', '3mf']);
    expect(result).not.toHaveProperty('createdAt');
    expect(normalizeMyMiniFactoryResults({ items: [null, { name: 'Valid', url: 'https://www.myminifactory.com/object/test', designer: null, images: [null], files: [null], likes: '100' }] }, 'cap'))
      .toEqual([{ title: 'Valid', url: 'https://www.myminifactory.com/object/test', providerId: 'myminifactory', query: 'cap' }]);
  });
  it('uses reported Thingiverse creation dates/downloads, omitting malformed optional metadata', () => {
    const [result] = normalizeThingiverseResults(thingiverse, 'cap');
    expect(result?.downloads).toBe(42);
    expect(result?.createdAt).toBe('2026-10-28T12:00:00Z');
    expect(normalizeThingiverseResults({ hits: [null, { name: 'Valid', public_url: 'https://www.thingiverse.com/thing:1', thumbnail: 'javascript:alert(1)', creator: null, like_count: -1, download_count: '42', created_at: 'invalid' }] }, 'cap'))
      .toEqual([{ title: 'Valid', url: 'https://www.thingiverse.com/thing:1', providerId: 'thingiverse', query: 'cap' }]);
  });
  it.each(cases)('rejects a nonempty unusable $id batch instead of reporting a successful empty search', (source) => {
    const items = [null, { name: 'Offsite', url: 'https://attacker.test/model', public_url: 'https://attacker.test/model' }];
    expect(() => source.normalize(source.id === 'myminifactory' ? { items } : { hits: items }, 'cap')).toThrow('no usable');
  });
});
