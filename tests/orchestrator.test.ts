// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Provider } from '../src/providers/provider';
import type { ModelResult } from '../src/shared/model-result';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';

function model(providerId: string, title = providerId): ModelResult {
  return { title, providerId, url: `https://example.test/${providerId}` };
}

/** Test-only providers; deliberately controllable and able to ignore cancellation. */
function mockProvider(id: string) {
  const requests: {
    query: string;
    signal?: AbortSignal;
    resolve: (results: ModelResult[]) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const search = vi.fn((query: string, signal?: AbortSignal) => new Promise<ModelResult[]>((resolve, reject) => {
    requests.push({ query, signal, resolve, reject });
  }));
  return { id, search, requests } satisfies Provider & { requests: typeof requests };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('independent provider searches', () => {
  function setup() {
    const updates: SearchSnapshot[] = [];
    const runner = new SearchOrchestrator((snapshot) => updates.push(snapshot));
    const latest = () => updates.at(-1)!;
    return { updates, runner, latest };
  }

  it('publishes fast results while slow providers are still searching, then appends slow results', async () => {
    const fast = mockProvider('fast');
    const slow = mockProvider('slow');
    const { runner, latest, updates } = setup();
    runner.start('gear', [slow, fast]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fast.search).toHaveBeenCalledOnce();
    expect(slow.search).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300);
    fast.requests[0]!.resolve([model('fast')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results.map((result) => result.providerId)).toEqual(['fast']);
    expect(latest().states.find((state) => state.providerId === 'slow')?.status).toBe('searching');
    const fastSnapshot = latest();
    await vi.advanceTimersByTimeAsync(400);
    slow.requests[0]!.resolve([model('slow')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results.map((result) => result.providerId)).toEqual(['fast', 'slow']);
    expect(fastSnapshot.results).toHaveLength(1);
    expect(updates).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates a rejected provider while another succeeds', async () => {
    const bad = mockProvider('bad');
    const good = mockProvider('good');
    const { runner, latest } = setup();
    runner.start('gear', [bad, good]);
    await vi.advanceTimersByTimeAsync(0);
    bad.requests[0]!.reject(new Error('Unavailable'));
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[0]).toMatchObject({ status: 'failed', error: 'Unavailable' });
    expect(latest().states[1]?.status).toBe('searching');
    good.requests[0]!.resolve([model('good')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results).toEqual([{ ...model('good'), query: 'gear' }]);
    expect(latest().states[0]?.status).toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates synchronous provider throws as failures too', async () => {
    const good = mockProvider('good');
    const { runner, latest } = setup();
    runner.start('gear', [{ id: 'throws', search() { throw new Error('Sync failure'); } }, good]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[0]).toMatchObject({ status: 'failed', error: 'Sync failure' });
    expect(good.search).toHaveBeenCalledOnce();
    good.requests[0]!.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().states[1]?.status).toBe('no-results');
  });

  it('times out only the overdue provider, aborts its signal, and ignores late settlement', async () => {
    const slow = mockProvider('slow');
    const good = mockProvider('good');
    const { runner, latest, updates } = setup();
    runner.start('gear', [slow, good], { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    good.requests[0]!.resolve([model('good')]);
    await vi.advanceTimersByTimeAsync(99);
    expect(latest().states[0]?.status).toBe('searching');
    await vi.advanceTimersByTimeAsync(1);
    expect(latest().states.map((state) => state.status)).toEqual(['timed-out', 'success']);
    expect(slow.requests[0]!.signal?.aborted).toBe(true);
    expect(good.requests[0]!.signal?.aborted).toBe(false);
    const count = updates.length;
    slow.requests[0]!.resolve([model('slow')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toHaveLength(count);
    expect(latest().results.map((result) => result.providerId)).toEqual(['good']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the old search and resets the new result set immediately', async () => {
    const provider = mockProvider('test');
    const { runner, latest } = setup();
    runner.start('old', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    runner.start('new', [provider]);
    expect(provider.requests[0]!.signal?.aborted).toBe(true);
    expect(latest()).toMatchObject({ query: 'new', results: [], states: [{ status: 'searching' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.requests[1]!.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    runner.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never publishes old results even when the provider ignores abort and resolves after the new search', async () => {
    const provider = mockProvider('test');
    const { runner, latest, updates } = setup();
    runner.start('old', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    runner.start('new', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    provider.requests[1]!.resolve([model('test', 'New model')]);
    await vi.advanceTimersByTimeAsync(0);
    const count = updates.length;
    provider.requests[0]!.resolve([model('test', 'Stale model')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toHaveLength(count);
    expect(latest().results).toEqual([{ ...model('test', 'New model'), query: 'new' }]);
  });

  it('ignores stale rejections as well as stale results', async () => {
    const provider = mockProvider('test');
    const { runner, latest, updates } = setup();
    runner.start('old', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    runner.start('new', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    const count = updates.length;
    provider.requests[0]!.reject(new Error('Late old failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toHaveLength(count);
    expect(latest().states[0]?.status).toBe('searching');
    runner.cancel();
  });

  it('treats an empty result as no-results, not a failure', async () => {
    const provider = mockProvider('empty');
    const { runner, latest } = setup();
    runner.start('gear', [provider]);
    await vi.advanceTimersByTimeAsync(0);
    provider.requests[0]!.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest()).toEqual({ query: 'gear', states: [{ providerId: 'empty', query: 'gear', status: 'no-results' }], results: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports external cancellation, retains completed results, and removes pending timers', async () => {
    const fast = mockProvider('fast');
    const slow = mockProvider('slow');
    const controller = new AbortController();
    const { runner, latest, updates } = setup();
    runner.start('gear', [fast, slow], { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    fast.requests[0]!.resolve([model('fast')]);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(latest().states.map((state) => state.status)).toEqual(['success', 'idle']);
    expect(latest().results).toHaveLength(1);
    expect(slow.requests[0]!.signal?.aborted).toBe(true);
    const count = updates.length;
    slow.requests[0]!.reject(new DOMException('Aborted', 'AbortError'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(updates).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not execute with an already-aborted signal or after an immediate cancel', async () => {
    const provider = mockProvider('test');
    const { runner, latest } = setup();
    const controller = new AbortController();
    controller.abort();
    runner.start('gear', [provider], { signal: controller.signal });
    expect(latest().states[0]?.status).toBe('idle');
    runner.start('gear', [provider]);
    runner.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.search).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('executes duplicate provider IDs only once and preserves supplied query provenance', async () => {
    const provider = mockProvider('test');
    const duplicate = mockProvider('test');
    const { runner, latest } = setup();
    runner.start('  cog  ', [provider, provider, duplicate]);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.search).toHaveBeenCalledOnce();
    expect(duplicate.search).not.toHaveBeenCalled();
    expect(provider.requests[0]!.query).toBe('cog');
    provider.requests[0]!.resolve([{ ...model('test'), query: 'gear' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().results[0]?.query).toBe('gear');
  });

  it('handles blank queries and no enabled providers without requests', async () => {
    const provider = mockProvider('test');
    const { runner, latest } = setup();
    runner.start('   ', [provider]);
    expect(latest().states[0]?.status).toBe('idle');
    runner.start('gear', []);
    expect(latest()).toEqual({ query: 'gear', states: [], results: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.search).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects invalid timeouts before starting work', () => {
    const { runner } = setup();
    for (const timeoutMs of [0, -1, NaN, Infinity, 2_147_483_648]) {
      expect(() => runner.start('gear', [], { timeoutMs })).toThrow(RangeError);
    }
  });

  it('allows the UI to start a new search during a completion callback', async () => {
    const old = mockProvider('old');
    const next = mockProvider('next');
    const updates: SearchSnapshot[] = [];
    const runner = new SearchOrchestrator((snapshot) => {
      updates.push(snapshot);
      if (snapshot.query === 'old' && snapshot.results.length) runner.start('new', [next]);
    });
    runner.start('old', [old]);
    await vi.advanceTimersByTimeAsync(0);
    old.requests[0]!.resolve([model('old')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.at(-1)).toMatchObject({ query: 'new', results: [] });
    expect(next.search).toHaveBeenCalledOnce();
    runner.cancel();
  });
});
