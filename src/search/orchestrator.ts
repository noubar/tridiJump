// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider } from '../providers/provider';
import type { ModelResult } from '../shared/model-result';
import type { ProviderSearchState } from './provider-state';
import { normalizeQuery } from './query';
import { SetupRequired } from '../providers/credentials';

export interface SearchSnapshot {
  query: string;
  states: ProviderSearchState[];
  /** Accumulated in provider completion order. Each new search starts empty. */
  results: ModelResult[];
}

export interface SearchOptions {
  signal?: AbortSignal;
  /** Timeout per provider in milliseconds. Defaults to 10 seconds. */
  timeoutMs?: number;
}

interface SearchRun {
  query: string;
  controller: AbortController;
  states: Map<string, ProviderSearchState>;
  results: ModelResult[];
  cleanups: Set<() => void>;
  detachSignal: () => void;
}

/** Repository-independent search runner. Supply only enabled providers. */
export class SearchOrchestrator {
  private current?: SearchRun;

  /** The synchronous UI observer should not throw or mutate its snapshots. */
  constructor(private readonly onUpdate: (snapshot: SearchSnapshot) => void) {}

  start(query: string, providers: readonly Provider[], options: SearchOptions = {}): void {
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
      throw new RangeError('Provider timeout must be a positive, finite timer duration.');
    }

    const previous = this.current;
    this.current = undefined;
    if (previous) this.stop(previous);

    // The first occurrence wins: one query execution per provider ID per run.
    const byId = new Map<string, Provider>();
    for (const provider of providers) {
      if (!byId.has(provider.id)) byId.set(provider.id, provider);
    }
    const unique = [...byId.values()];
    const normalized = normalizeQuery(query);
    const run: SearchRun = {
      query: normalized,
      controller: new AbortController(),
      states: new Map(unique.map((provider) => [provider.id, normalized
        ? { providerId: provider.id, status: 'searching', query: normalized }
        : { providerId: provider.id, status: 'idle' }])),
      results: [],
      cleanups: new Set(),
      detachSignal: () => {},
    };
    this.current = run;

    const abort = () => { if (this.current === run) this.cancel(); };
    options.signal?.addEventListener('abort', abort, { once: true });
    run.detachSignal = () => options.signal?.removeEventListener('abort', abort);
    if (options.signal?.aborted) {
      this.cancel();
      return;
    }
    this.publish(run);
    if (!normalized || unique.length === 0) run.detachSignal();
    for (const provider of unique) {
      if (!normalized || this.current !== run || run.controller.signal.aborted) break;
      this.searchProvider(run, provider, timeoutMs);
    }
  }

  /** Retain completed results and return unfinished providers to idle. */
  cancel(): void {
    const run = this.current;
    if (!run || run.controller.signal.aborted) return;
    this.stop(run);
    for (const [id, state] of run.states) {
      if (state.status === 'searching') run.states.set(id, { providerId: id, status: 'idle' });
    }
    this.publish(run);
  }

  private stop(run: SearchRun): void {
    run.detachSignal();
    run.controller.abort();
    for (const cleanup of run.cleanups) cleanup();
  }

  private publish(run: SearchRun): void {
    if (this.current !== run) return;
    this.onUpdate({ query: run.query, states: [...run.states.values()], results: [...run.results] });
  }

  private searchProvider(run: SearchRun, provider: Provider, timeoutMs: number): void {
    const controller = new AbortController();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      run.cleanups.delete(abort);
    };
    const abort = () => {
      settled = true;
      cleanup();
      controller.abort();
    };
    const finish = (state: ProviderSearchState) => {
      if (settled || this.current !== run || run.controller.signal.aborted) return;
      settled = true;
      cleanup();
      run.states.set(provider.id, state);
      if (state.status === 'success') run.results.push(...state.results);
      if (![...run.states.values()].some((value) => value.status === 'searching')) run.detachSignal();
      this.publish(run);
    };
    const timer = setTimeout(() => {
      finish({ providerId: provider.id, query: run.query, status: 'timed-out' });
      controller.abort();
    }, timeoutMs);
    run.cleanups.add(abort);

    // A microtask also isolates synchronous throws from incorrectly implemented providers.
    void Promise.resolve().then(() => {
      if (settled || this.current !== run || run.controller.signal.aborted) return [];
      return provider.search(run.query, controller.signal);
    }).then((results) => {
      if (settled || this.current !== run || run.controller.signal.aborted) return;
      const tagged = results.map((result) => ({ ...result, query: result.query ?? run.query }));
      finish(tagged.length
        ? { providerId: provider.id, query: run.query, status: 'success', results: tagged }
        : { providerId: provider.id, query: run.query, status: 'no-results' });
    }, (error: unknown) => {
      if (error instanceof SetupRequired) {
        finish({ providerId: provider.id, status: 'setup-required' });
        return;
      }
      finish({
        providerId: provider.id, query: run.query, status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
