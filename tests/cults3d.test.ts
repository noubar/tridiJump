// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCultsProvider, cultsSearchUrl, normalizeCultsResults } from '../src/providers/cults3d';
import { SetupRequired } from '../src/providers/credentials';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/cults3d/search.json', import.meta.url), 'utf8'));
const credentials = { nickname: 'test-user', apiKey: 'test-only-key' };
const makeProvider = () => createCultsProvider(() => credentials);
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Cults3D normalization', () => {
  it('normalizes documented metadata, including zero counts and EUR minor units', () => {
    const results = normalizeCultsResults(fixture, 'planter');
    expect(results).toEqual([
      { title: 'Synthetic free planter', url: 'https://cults3d.com/en/3d-model/art/tridijump-test-planter', providerId: 'cults3d', query: 'planter', thumbnail: 'https://images.example.test/planter.png', creator: 'test-maker', price: { amount: 0, currency: 'EUR' }, isFree: true, downloads: 0, popularity: 12 },
      { title: 'Synthetic paid box', url: 'https://cults3d.com/en/3d-model/tool/tridijump-test-box', providerId: 'cults3d', query: 'planter', price: { amount: 3.25, currency: 'EUR' }, isFree: false },
    ]);
    expect(results[0]).not.toHaveProperty('createdAt');
    expect(results[0]).not.toHaveProperty('rating');
    expect(results[0]).not.toHaveProperty('formats');
  });

  it('accepts empty results but rejects missing or invalid envelopes', () => {
    expect(normalizeCultsResults({ data: { creationsSearchBatch: { results: [] } } }, 'q')).toEqual([]);
    for (const value of [null, {}, { data: null }, { data: { creationsSearchBatch: { results: null } } }]) {
      expect(() => normalizeCultsResults(value, 'q')).toThrow('unexpected');
    }
  });

  it('omits malformed optional values and skips unusable records without inventing defaults', () => {
    const payload = { data: { creationsSearchBatch: { results: [
      null, { name: '', url: 'https://cults3d.com/model' },
      { name: 'Unsafe', url: 'javascript:alert(1)' },
      { name: 'Offsite', url: 'https://example.test/model' },
      { name: 'Valid', url: 'https://cults3d.com/en/3d-model/art/test', illustrationImageUrl: 'data:bad', creator: { nick: 12 }, price: { cents: -1 }, downloadsCount: '30', likesCount: NaN },
    ] } } };
    expect(normalizeCultsResults(payload, 'q')).toEqual([
      { title: 'Valid', url: 'https://cults3d.com/en/3d-model/art/test', providerId: 'cults3d', query: 'q' },
    ]);
    expect(() => normalizeCultsResults({ data: { creationsSearchBatch: { results: [null] } } }, 'q')).toThrow('no usable');
  });

  it('treats GraphQL errors, including partial failures, as failures and does not expose server text', () => {
    expect(() => normalizeCultsResults({ ...fixture, errors: [{ message: 'secret server echo' }] }, 'q')).toThrow('API rejected');
    try { normalizeCultsResults({ errors: [{ message: 'secret server echo' }] }, 'q'); }
    catch (error) { expect(String(error)).not.toContain('secret server echo'); }
  });

  it('encodes direct-search queries safely', () => {
    const value = 'café + & # / <tag>';
    const url = new URL(cultsSearchUrl(value));
    expect(url.origin).toBe('https://cults3d.com');
    expect(url.pathname).toBe('/en/search');
    expect(url.searchParams.get('q')).toBe(value);
    expect(url.hash).toBe('');
  });
});

describe('Cults3D official API transport', () => {
  it('uses the fixed endpoint, variables, authorized Basic credentials, and the supplied signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(fixture));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    expect(await makeProvider().search('  planter & box  ', controller.signal)).toHaveLength(2);
    const [endpoint, options] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe('https://cults3d.com/graphql');
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
    expect(options.headers.Authorization).toBe(`Basic ${btoa('test-user:test-only-key')}`);
    const body = JSON.parse(options.body);
    expect(body.variables).toEqual({ query: 'planter & box' });
    expect(body.query).toContain('limit: 20');
    expect(body.query).not.toContain('planter & box');
    expect(body.query).not.toContain('test-only-key');
  });

  it('does not send requests without credentials, for invalid credentials, or for blank queries', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(createCultsProvider(() => undefined).search('q')).rejects.toBeInstanceOf(SetupRequired);
    await expect(createCultsProvider(() => ({ nickname: 'bad:user', apiKey: 'FAKE-INVALID-NICKNAME-KEY' })).search('q')).rejects.toThrow('valid');
    await expect(makeProvider().search('  ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500])('reports HTTP %s without rendering errors as empty results', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ secret: 'not-for-display' }, status)));
    await expect(makeProvider().search('q')).rejects.toThrow(status === 500 ? 'HTTP 500' : 'denied access');
  });

  it('reports non-JSON and network errors safely', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('<html>challenge</html>')).mockRejectedValueOnce(new Error('secret'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(makeProvider().search('q')).rejects.toThrow('unreadable');
    await expect(makeProvider().search('q')).rejects.toThrow('Could not reach');
  });

  it('honors rate-limit cooldowns without automatic retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 429, { 'Retry-After': '2' })).mockResolvedValueOnce(json(fixture));
    vi.stubGlobal('fetch', fetchMock);
    const provider = makeProvider();
    await expect(provider.search('q')).rejects.toThrow('rate limit');
    await expect(provider.search('q')).rejects.toThrow('rate limit');
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(provider.search('q')).resolves.toHaveLength(2);
  });

  it('honors a zero-second Retry-After without substituting a one-minute cooldown', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 429, { 'Retry-After': '0' })).mockResolvedValueOnce(json(fixture));
    vi.stubGlobal('fetch', fetchMock);
    const provider = makeProvider();
    await expect(provider.search('q')).rejects.toThrow('rate limit');
    await expect(provider.search('q')).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects pre-cancelled requests before fetching and propagates in-flight cancellation', async () => {
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const before = new AbortController(); before.abort();
    await expect(makeProvider().search('q', before.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    const during = new AbortController();
    const pending = makeProvider().search('q', during.signal);
    during.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sanitizes credential-loader failures and preserves abort when loading rejects after cancellation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = createCultsProvider(async () => { throw new Error('FAKE-PRIVATE-LOADER-TEXT'); });
    await expect(provider.search('gear')).rejects.toThrow('configuration could not be loaded');
    let rejectRead!: (error: Error) => void;
    const delayed = createCultsProvider(() => new Promise((_resolve, reject) => { rejectRead = reject; }));
    const controller = new AbortController();
    const pending = delayed.search('gear', controller.signal);
    controller.abort();
    rejectRead(new Error('FAKE-PRIVATE-LOADER-TEXT'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
