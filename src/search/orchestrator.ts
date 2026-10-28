// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider, ResultPage } from '../providers/provider';
import type { ModelResult } from '../shared/model-result';
import type { ProviderSearchState } from './provider-state';
import { normalizeQuery } from './query';
import { SetupRequired } from '../providers/credentials';

export interface SearchSnapshot {
  query: string;
  states: ProviderSearchState[];
  /** Accumulated in provider completion order. Each new search starts empty. */
  results: ModelResult[];
  /** Present for incremental adapters; counts describe loaded data, never repository totals. */
  pages?: { providerId: string; hasMore: boolean; loading: boolean }[];
}

export interface SearchOptions {
  signal?: AbortSignal;
  disabledProviderIds?: ReadonlySet<string>;
  /** Already-expanded local terms, bounded/deduplicated here. No external expansion service. */
  expandedQueries?: readonly string[];
  /** Timeout per provider in milliseconds. Defaults to 10 seconds. */
  timeoutMs?: number;
}

interface QueryStream {
  query: string;
  cursor?: string;
  started: boolean;
}
interface ProviderProgress {
  provider: Provider;
  streams: QueryStream[];
  results: ModelResult[];
  pending: boolean;
  nextStream: number;
}
interface SearchRun {
  query: string;
  progress: Map<string, ProviderProgress>;
  seen: Set<string>;
  disabled: Set<string>;
  timeoutMs: number;
  controller: AbortController;
  states: Map<string, ProviderSearchState>;
  results: ModelResult[];
  cleanups: Set<() => void>;
  detachSignal: () => void;
}

/** Repository-independent search runner. Disabled providers are represented without executing them. */
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
    const queries = [...new Set([normalized, ...(options.expandedQueries ?? []).map(normalizeQuery).filter(Boolean)])].slice(0, 4);
    const run: SearchRun = {
      query: normalized,
      progress: new Map(unique.map((provider) => [provider.id, {
        provider, results: [], pending: false, nextStream: 0,
        streams: queries.map((query) => ({ query, started: false })),
      }])),
      seen: new Set(), disabled: new Set(options.disabledProviderIds), timeoutMs,
      controller: new AbortController(),
      states: new Map(unique.map((provider) => [provider.id, options.disabledProviderIds?.has(provider.id)
        ? { providerId: provider.id, status: 'disabled' } : normalized
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
    if (![...run.states.values()].some((state) => state.status === 'searching')) run.detachSignal();
    for (const provider of unique) {
      if (!normalized || this.current !== run || run.controller.signal.aborted) break;
      if (options.disabledProviderIds?.has(provider.id)) continue;
      this.searchProvider(run, run.progress.get(provider.id)!, 0);
    }
  }

  /** One page per eligible provider per user action, without restarting the run. */
  loadMore(disabledProviderIds?: ReadonlySet<string>): void {
    const run = this.current;
    if (!run || run.controller.signal.aborted) return;
    if (disabledProviderIds) run.disabled = new Set(disabledProviderIds);
    // Select all work before publishing: synchronous observers may start a new search.
    const work: { progress: ProviderProgress; index: number }[] = [];
    for (const progress of run.progress.values()) {
      const id = progress.provider.id;
      if (run.disabled.has(id)) {
        if (!progress.pending) run.states.set(id, { providerId: id, status: 'disabled' });
        continue;
      }
      if (progress.pending || run.states.get(id)?.status === 'setup-required') continue;
      for (let offset = 0; offset < progress.streams.length; offset++) {
        const index = (progress.nextStream + offset) % progress.streams.length;
        const stream = progress.streams[index]!;
        if (stream.started && stream.cursor !== undefined) {
          work.push({ progress, index });
          progress.nextStream = (index + 1) % progress.streams.length;
          break;
        }
      }
    }
    this.publish(run);
    for (const { progress, index } of work) {
      if (this.current !== run || run.controller.signal.aborted) break;
      this.searchProvider(run, progress, index);
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
    const paged = [...run.progress.values()].filter((item) => item.provider.searchPage);
    this.onUpdate({ query: run.query, states: [...run.states.values()], results: [...run.results],
      ...(paged.length ? { pages: paged.map((item) => ({ providerId: item.provider.id,
        hasMore: !run.controller.signal.aborted && !run.disabled.has(item.provider.id)
          && run.states.get(item.provider.id)?.status !== 'setup-required'
          && item.streams.some((stream) => stream.started && stream.cursor !== undefined),
        loading: item.pending,
      })) } : {}),
    });
  }

  private searchProvider(run: SearchRun, progress: ProviderProgress, streamIndex: number): void {
    const provider = progress.provider;
    const stream = progress.streams[streamIndex]!;
    const cursor = stream.cursor;
    const alreadySearching = run.states.get(provider.id)?.status === 'searching';
    progress.pending = true;
    stream.started = true;
    run.states.set(provider.id, { providerId: provider.id, query: stream.query, status: 'searching' });
    if (!alreadySearching) this.publish(run);
    if (this.current !== run || run.controller.signal.aborted) { progress.pending = false; return; }
    const controller = new AbortController();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      run.cleanups.delete(abort);
    };
    const abort = () => {
      settled = true;
      progress.pending = false;
      cleanup();
      controller.abort();
    };
    const finish = (state: ProviderSearchState) => {
      if (settled || this.current !== run || run.controller.signal.aborted) return;
      settled = true;
      cleanup();
      progress.pending = false;
      run.states.set(provider.id, state);
      if (state.status === 'failed' || state.status === 'timed-out' || state.status === 'setup-required') {
        // Stop initial variant fan-out on an error; existing continuations remain user-retryable.
        for (const item of progress.streams) item.started = true;
      }
      if (![...run.states.values()].some((value) => value.status === 'searching')
        && ![...run.progress.values()].some((item) => !run.disabled.has(item.provider.id) && item.streams.some((value) => !value.started || value.cursor !== undefined))) run.detachSignal();
      this.publish(run);
    };
    const timer = setTimeout(() => {
      finish({ providerId: provider.id, query: run.query, status: 'timed-out' });
      controller.abort();
    }, run.timeoutMs);
    run.cleanups.add(abort);

    // A microtask also isolates synchronous throws from incorrectly implemented providers.
    void Promise.resolve().then(() => {
      if (settled || this.current !== run || run.controller.signal.aborted) return { results: [] };
      return provider.searchPage
        ? provider.searchPage(stream.query, cursor, controller.signal)
        : provider.search(stream.query, controller.signal).then((results): ResultPage => ({ results }));
    }).then((page) => {
      if (settled || this.current !== run || run.controller.signal.aborted) return;
      for (const result of page.results) {
        const keys = [`${provider.id}\0url:${result.url.split('#')[0]}`];
        if (result.id !== undefined) keys.push(`${provider.id}\0id:${result.id}`);
        const duplicate = keys.some((key) => run.seen.has(key));
        for (const key of keys) run.seen.add(key);
        if (duplicate) continue;
        const tagged = { ...result, query: result.query ?? stream.query };
        progress.results.push(tagged);
        run.results.push(tagged);
      }
      // A duplicate-only page is not proof of exhaustion; only the adapter owns continuation.
      stream.cursor = page.nextCursor;
      const nextInitial = progress.streams.findIndex((item) => !item.started);
      finish(progress.results.length
        ? { providerId: provider.id, query: run.query, status: 'success', results: [...progress.results] }
        : { providerId: provider.id, query: run.query, status: 'no-results' });
      if (nextInitial >= 0 && this.current === run && !run.controller.signal.aborted) {
        this.searchProvider(run, progress, nextInitial);
      }
    }, (error: unknown) => {
      if (error instanceof SetupRequired) {
        for (const item of progress.streams) { item.started = true; item.cursor = undefined; }
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
