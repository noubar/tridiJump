// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCultsProvider } from '../src/providers/cults3d';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import type { Provider } from '../src/providers/provider';

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
