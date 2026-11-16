// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { readSearch } from '../search/query';
import { initializeSearchForm } from '../search/form';
import { readPreferences, rememberSearch, readRepositories, repositoryEnabled, REPOSITORIES_KEY } from '../shared/preferences';
import { observeLocal } from '../shared/extension-storage';
import { initializeTheme } from '../shared/theme';
import { providerAvailability } from '../providers/availability';
import { createResultsView } from './view';
import { expandQuery } from '../synonyms/expand-query';
import { resolveRepositoryStates } from '../providers/repository-state';

void initializeTheme();
const search = readSearch(window.location.search, (await readPreferences().catch(() => ({ expandedDefault: false }))).expandedDefault);
const form = document.querySelector<HTMLFormElement>('#search-form')!;
initializeSearchForm(form, search.expanded);
const input = form.elements.namedItem('q') as HTMLInputElement;
const expanded = form.elements.namedItem('expanded') as HTMLInputElement;
input.value = search.query;
const sources = providerAvailability.flatMap((source) => 'createProvider' in source
  ? [{ name: source.name, provider: source.createProvider(), searchUrl: source.searchUrl }] : []);
const view = createResultsView(document.querySelector('main')!, sources, {
  async readDisabledProviders() {
    const choices = await readRepositories();
    // Credential removal is handled by the storage observer below. Pagination only
    // needs current user choices and must not repeat setup checks.
    return new Set(providerAvailability.filter((source) => !repositoryEnabled(source, choices)).map((source) => source.id));
  },
});

let generation = 0;
async function runSearch() {
  const current = ++generation;
  const query = input.value;
  const expandedMode = expanded.checked;
  const expandedTerms = document.querySelector<HTMLElement>('#expanded-terms')!;
  expandedTerms.hidden = true;
  expandedTerms.textContent = '';
  view.search('');
  let choices: Record<string, boolean>;
  let repositoryStates: Awaited<ReturnType<typeof resolveRepositoryStates>>;
  let variants: string[];
  try {
    [choices, variants] = await Promise.all([
      readRepositories(),
      expandedMode ? expandQuery(query) : Promise.resolve([query]),
    ]);
    repositoryStates = await resolveRepositoryStates(providerAvailability, choices, { checkDisabledCredentials: false });
  } catch {
    if (current === generation) document.querySelector('#storage-status')!.textContent = 'Repository settings could not be read. Search was not started.';
    return;
  }
  if (current !== generation) return;
  const alternatives = variants.slice(1);
  const links = document.querySelector<HTMLElement>('#native-searches')!;
  const directSearchSection = document.querySelector<HTMLElement>('#direct-search-section')!;
  links.hidden = !query;
  directSearchSection.hidden = !query;
  links.replaceChildren(...providerAvailability.filter((source) => repositoryStates.get(source.id)!.userEnabled).map((source) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.searchUrl(query);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Search directly on ${source.name}`;
    link.dataset.providerId = source.id;
    item.append(link);
    return item;
  }));
  document.querySelector('#fallback-status')!.replaceChildren(...providerAvailability.filter((source) => source.classification === 'D' && repositoryStates.get(source.id)!.searchEnabled).map((source) => {
    const item = document.createElement('li');
    item.textContent = `${source.name}: direct search only — ${source.reason}`;
    return item;
  }));
  document.querySelector('#search-summary')!.textContent = query
    ? `Results for “${query}” · Expanded search ${expandedMode ? 'on' : 'off'}`
    : 'Enter a query to start a search.';
  if (query && expandedMode) {
    expandedTerms.hidden = false;
    expandedTerms.textContent = alternatives.length
      ? `Additional search terms: ${alternatives.join(' · ')}`
      : 'No useful related terms found. Searching the original query only.';
  }
  document.querySelector('#storage-status')!.textContent = '';
  if (query) {
    void rememberSearch(query).catch(() => {
      if (current === generation) document.querySelector('#storage-status')!.textContent = 'Search history could not be saved on this device.';
    });
  }
  const setupRequired = new Set(providerAvailability.filter((source) => {
    const state = repositoryStates.get(source.id)!;
    return state.userEnabled && state.requiresCredentials && !state.credentialsConfigured;
  }).map((source) => source.id));
  view.search(query,
    new Set(providerAvailability.filter((source) => !repositoryStates.get(source.id)!.searchEnabled).map((source) => source.id)),
    alternatives, setupRequired);
}

form.addEventListener('submit', (event) => {
  // The shared form listener validates and trims first.
  if (event.defaultPrevented) return;
  event.preventDefault();
  const params = new URLSearchParams({ q: input.value });
  if (expanded.checked) params.set('expanded', '1');
  window.history.replaceState(null, '', `?${params}`);
  void runSearch();
});
// Credential removal must immediately abort any credentialed request and refresh availability.
// Saving credentials does not auto-search; the user retains control over when a new search starts.
const stopStorage = observeLocal((changes) => {
  const removedCredential = Object.entries(changes).some(([key, change]) =>
    key.startsWith('tridijump.credentials.') && change.newValue === undefined);
  if (removedCredential && input.value) void runSearch();
  if (Object.hasOwn(changes, REPOSITORIES_KEY)) {
    // Repository choices apply on the next explicit search, as described in Settings.
  }
});
window.addEventListener('pagehide', () => { generation++; view.cancel(); stopStorage(); });
void runSearch();
