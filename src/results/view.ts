// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider } from '../providers/provider';
import { SearchOrchestrator } from '../search/orchestrator';
import type { SearchSnapshot } from '../search/orchestrator';
import type { ProviderSearchState } from '../search/provider-state';
import type { ModelResult } from '../shared/model-result';
import { createModelCard, safeModelUrl } from './card';
import { canSort, filterResults, priceKind, SORTS, sortResults } from './result-options';
import type { PriceFilter, SortOrder } from './result-options';

export interface ResultSource { name: string; provider: Provider; searchUrl?: (query: string) => string }

function option(label: string, value: string): HTMLOptionElement {
  const element = document.createElement('option');
  element.textContent = label;
  element.value = value;
  return element;
}

/** Owns only results controls and rendering; provider behavior stays behind its contract. */
export function createResultsView(root: HTMLElement, sources: readonly ResultSource[], options: {
  readDisabledProviders?: () => Promise<ReadonlySet<string>>;
} = {}) {
  const grid = root.querySelector<HTMLElement>('#results-grid')!;
  const empty = root.querySelector<HTMLElement>('#empty-state')!;
  const count = root.querySelector<HTMLElement>('#result-count')!;
  const sort = root.querySelector<HTMLSelectElement>('#sort')!;
  const format = root.querySelector<HTMLSelectElement>('#format')!;
  const price = root.querySelector<HTMLSelectElement>('#price')!;
  const repositories = root.querySelector<HTMLElement>('#repository-options')!;
  const statuses = root.querySelector<HTMLElement>('#provider-status')!;
  const loadMore = root.querySelector<HTMLButtonElement>('#load-more')!;
  const paginationHelp = root.querySelector<HTMLElement>('#pagination-help')!;
  let version = 0;
  const names = new Map(sources.map((source) => [source.provider.id, source.name]));
  const selected = new Set(names.keys());
  const statusItems = new Map<string, HTMLLIElement>();
  const renderedStates = new Map<string, ProviderSearchState>();
  const nativeSearches = new Map(sources.map((source) => [source.provider.id, source.searchUrl]));
  const cards = new Map<ModelResult, HTMLElement>();
  let snapshot: SearchSnapshot = { query: '', states: [], results: [] };
  let formats: string[] = [];

  for (const source of sources) {
    const label = document.createElement('label');
    label.className = 'check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.value = source.provider.id;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(source.provider.id);
      else selected.delete(source.provider.id);
      render();
    });
    label.append(checkbox, document.createTextNode(source.name));
    repositories.append(label);
    const item = document.createElement('li');
    item.dataset.status = 'idle';
    item.textContent = `${source.name}: idle`;
    statuses.append(item);
    statusItems.set(source.provider.id, item);
  }
  for (const [value, label] of SORTS) sort.add(option(label, value));

  function render() {
    const available = [...new Set(snapshot.results.flatMap((result) => result.formats ?? []))].sort();
    if (available.join('\0') !== formats.join('\0')) {
      formats = available;
      const previous = format.value;
      format.replaceChildren(option('All formats', ''), ...formats.map((value) => option(value.toUpperCase(), value)));
      format.value = formats.includes(previous) ? previous : '';
    }
    format.disabled = formats.length === 0;
    root.querySelector('#format-help')!.textContent = formats.length
      ? 'Models without format information are excluded when a format is selected.'
      : 'No file-format information is available yet.';

    const filtered = filterResults(snapshot.results, { providerIds: selected, price: price.value as PriceFilter, format: format.value });
    const unknownPrices = new Map<string, number>();
    for (const result of snapshot.results) {
      if (selected.has(result.providerId) && priceKind(result) === undefined) {
        unknownPrices.set(result.providerId, (unknownPrices.get(result.providerId) ?? 0) + 1);
      }
    }
    root.querySelector('#price-help')!.textContent = 'Free and Paid exclude models whose price status is unknown.'
      + (unknownPrices.size ? ' Price unavailable in loaded results: '
        + [...unknownPrices].map(([id, count]) => `${names.get(id) ?? id} (${count})`).join(', ') + '.' : '');
    for (const option of sort.options) option.disabled = !canSort(filtered, option.value as SortOrder);
    if (!canSort(filtered, sort.value as SortOrder)) sort.value = 'best';
    const visible = sortResults(filtered, sort.value as SortOrder);
    const desired = visible.map((result) => {
      let card = cards.get(result);
      if (!card) {
        card = createModelCard(result, names.get(result.providerId) ?? result.providerId);
        cards.set(result, card);
      }
      return card;
    });
    const keep = new Set(desired);
    for (const child of [...grid.children]) if (!keep.has(child as HTMLElement)) child.remove();
    // Keep existing nodes (and focus/images); default ordering only appends new cards.
    desired.forEach((card, index) => {
      if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] ?? null);
    });
    const pending = snapshot.states.filter((state) => state.status === 'searching').length;
    count.textContent = `${visible.length} matching · ${snapshot.results.length} loaded · ${pending} sources searching`;
    const hasMore = snapshot.pages?.some((page) => page.hasMore) ?? false;
    loadMore.hidden = !hasMore;
    loadMore.disabled = snapshot.pages?.some((page) => page.loading) ?? false;
    loadMore.textContent = loadMore.disabled ? 'Loading…' : 'Load more';
    paginationHelp.textContent = 'Filters and sorting apply to loaded models.'
      + (hasMore ? ' More results may be available; load another page to find additional matches.' : '');
    empty.hidden = visible.length > 0;
    const failed = snapshot.states.some((state) => state.status === 'failed' || state.status === 'timed-out');
    const setupRequired = snapshot.states.some((state) => state.status === 'setup-required');
    empty.textContent = !snapshot.query ? 'Enter a query to search for models.'
      : sources.length === 0 || snapshot.states.every((state) => state.status === 'disabled') ? 'No repository searches are enabled. Open the source directly using the link above.'
      : snapshot.results.length ? 'No models match these filters.'
      : pending ? 'Searching sources…'
      : setupRequired ? 'Configure repositories in Settings or open the source directly.'
      : failed ? 'Search could not complete. Check provider status or open the source directly.' : 'No models found.';
    for (const state of snapshot.states) {
      const item = statusItems.get(state.providerId);
      // Preserve action links and keyboard focus when only another provider updates.
      if (item && renderedStates.get(state.providerId) !== state) {
        renderedStates.set(state.providerId, state);
        item.dataset.status = state.status;
        item.textContent = `${names.get(state.providerId) ?? state.providerId}: ${state.status === 'setup-required' ? 'Setup required' : state.status}`
        + (state.status === 'success' ? ` (${state.results.length} models)` : '')
        + (state.status === 'failed' ? ` — ${state.error}` : '');
        if (state.status === 'setup-required') {
          const link = document.createElement('a');
          link.href = `../settings/index.html#provider-${encodeURIComponent(state.providerId)}`;
          link.textContent = 'Configure';
          item.append(' · ', link);
          const searchUrl = nativeSearches.get(state.providerId)?.(snapshot.query);
          const safeUrl = searchUrl ? safeModelUrl(searchUrl) : undefined;
          if (safeUrl) {
            const direct = document.createElement('a');
            direct.href = safeUrl;
            direct.target = '_blank';
            direct.rel = 'noopener noreferrer';
            direct.textContent = 'Search directly';
            item.append(' · ', direct);
          }
        }
      }
    }
  }

  price.addEventListener('change', render);
  format.addEventListener('change', render);
  sort.addEventListener('change', render);
  const runner = new SearchOrchestrator((update) => { snapshot = update; render(); });
  loadMore.addEventListener('click', () => {
    if (loadMore.disabled) return;
    const current = version;
    loadMore.disabled = true;
    void (options.readDisabledProviders?.() ?? Promise.resolve(undefined)).then((disabled) => {
      if (current === version) runner.loadMore(disabled);
    }, () => {
      if (current === version) paginationHelp.textContent = 'Repository settings could not be read. No additional requests were started.';
    }).finally(() => { if (current === version) loadMore.disabled = snapshot.pages?.some((page) => page.loading) ?? false; });
  });
  render();
  return {
    search(query: string, disabledProviderIds?: ReadonlySet<string>, expandedQueries?: readonly string[]) {
      version++;
      cards.clear();
      runner.start(query, sources.map((source) => source.provider), { disabledProviderIds, expandedQueries });
    },
    loadMore(disabledProviderIds?: ReadonlySet<string>) { runner.loadMore(disabledProviderIds); },
    cancel() { version++; runner.cancel(); },
  };
}
