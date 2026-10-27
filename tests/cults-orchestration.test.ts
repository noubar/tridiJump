// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCultsProvider } from '../src/providers/cults3d';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import type { Provider } from '../src/providers/provider';
import { saveCredentials } from '../src/providers/credentials';
import { cultsCredentialFields } from '../src/providers/cults3d';
import { mockExtensionStorage } from './helpers/extension-storage';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/cults3d/search.json', import.meta.url), 'utf8'));
const cults = () => createCultsProvider(() => ({ nickname: 'test-user', apiKey: 'test-only-key' }));
const companion: Provider = {
  id: 'companion-test',
  async search() {
    // The smallest valid result: no thumbnail, price, creator, or sort metadata.
    return [{ title: 'Companion', url: 'https://example.test/model', providerId: 'companion-test' }];
  },
};
function setup() {
  const updates: SearchSnapshot[] = [];
  return { runner: new SearchOrchestrator((update) => updates.push(update)), updates, latest: () => updates.at(-1)! };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('real adapter at the core boundary (mocked HTTP only)', () => {
  it('publishes setup-required without fetching and lets other providers complete', async () => {
    mockExtensionStorage();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { runner, latest } = setup();
    runner.start('gear', [createCultsProvider(), companion]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states).toContainEqual({ providerId: 'cults3d', status: 'setup-required' });
    expect(latest().states[1]?.status).toBe('success');
    expect(latest().results).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses only Cults local credentials and never includes them in states, results or errors', async () => {
    mockExtensionStorage();
    const values = { nickname: 'test-user', apiKey: 'FAKE-CULTS-ONLY' };
    await saveCredentials('cults3d', cultsCredentialFields, values);
    await saveCredentials('other-test', cultsCredentialFields, { nickname: 'other-user', apiKey: 'FAKE-OTHER-ONLY' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    const { runner, latest, updates } = setup();
    runner.start('gear', [createCultsProvider()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[0]?.status).toBe('success');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [endpoint, request] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe('https://cults3d.com/graphql');
    expect(request.headers.Authorization).toBe(`Basic ${btoa('test-user:FAKE-CULTS-ONLY')}`);
    expect(request.body).not.toContain(values.apiKey);
    expect(JSON.stringify(updates)).not.toContain(values.apiKey);
    expect(JSON.stringify(updates)).not.toContain('FAKE-OTHER-ONLY');
    expect(JSON.stringify(updates)).not.toContain(request.headers.Authorization);
  });

  it.each(['new search', 'cancel', 'timeout'] as const)('does not launch a stale request after credential loading: %s', async (action) => {
    const { local } = mockExtensionStorage();
    let resolveRead!: (value: Record<string, unknown>) => void;
    local.get.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { runner, latest, updates } = setup();
    runner.start('old', [createCultsProvider()], { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(local.get).toHaveBeenCalledOnce();
    if (action === 'new search') {
      runner.start('new', [companion]);
      await vi.advanceTimersByTimeAsync(0);
    } else if (action === 'cancel') runner.cancel();
    else await vi.advanceTimersByTimeAsync(50);
    const count = updates.length;
    resolveRead({ 'tridijump.credentials.cults3d': { nickname: 'test-user', apiKey: 'FAKE-DELAYED-KEY' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(count);
    expect(latest().states[0]?.status).toBe(action === 'new search' ? 'success' : action === 'timeout' ? 'timed-out' : 'idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads configuration again on the next search after keys are removed', async () => {
    const { local } = mockExtensionStorage();
    await saveCredentials('cults3d', cultsCredentialFields, { nickname: 'test-user', apiKey: 'FAKE-REMOVABLE' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    const { runner, latest } = setup();
    const provider = createCultsProvider();
    runner.start('first', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[0]?.status).toBe('success');
    await local.remove('tridijump.credentials.cults3d');
    runner.start('second', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states).toEqual([{ providerId: 'cults3d', status: 'setup-required' }]);
    expect(latest().results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('isolates a GraphQL failure while another provider succeeds with minimal metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: 'private server text' }] }))));
    const { runner, latest } = setup();
    runner.start('gear', [cults(), companion]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states.map((state) => state.status)).toEqual(['failed', 'success']);
    expect(latest().results).toEqual([{ title: 'Companion', url: 'https://example.test/model', providerId: 'companion-test', query: 'gear' }]);
    expect(JSON.stringify(latest())).not.toContain('private server text');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the core timeout aborts the real adapter without changing timeout to failure', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal!;
      return new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }));
    const { runner, latest, updates } = setup();
    runner.start('gear', [cults(), companion], { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(49);
    expect(latest().states.map((state) => state.status)).toEqual(['searching', 'success']);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(latest().states.map((state) => state.status)).toEqual(['timed-out', 'success']);
    expect(latest().results).toHaveLength(1);
    expect(updates).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('blocks stale data when a new query cancels the adapter during JSON body reading', async () => {
    let resolveBody!: (payload: unknown) => void;
    const body = new Promise<unknown>((resolve) => { resolveBody = resolve; });
    const readBody = vi.fn(() => body);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), json: readBody })
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    const { runner, latest, updates } = setup();
    const provider = cults();
    runner.start('old', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    expect(readBody).toHaveBeenCalledOnce();
    const oldSignal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    runner.start('new', [provider]);
    expect(oldSignal.aborted).toBe(true);
    expect(latest().results).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toHaveLength(2);
    expect(latest().results.every((result) => result.query === 'new')).toBe(true);
    const length = updates.length;
    // Simulate a body reader that ignores abort and finishes after the new query.
    resolveBody(fixture);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toHaveLength(length);
    expect(latest().query).toBe('new');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes no-results for a valid empty API batch without inventing metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { creationsSearchBatch: { results: [] } } }))));
    const { runner, latest } = setup();
    runner.start('gear', [cults()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states).toEqual([{ providerId: 'cults3d', query: 'gear', status: 'no-results' }]);
    expect(latest().results).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
