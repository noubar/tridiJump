// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { readSearch } from '../search/query';
import { initializeSearchForm } from '../search/form';
import { readPreferences, rememberSearch, readRepositories, repositoryEnabled } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';
import { providerAvailability } from '../providers/availability';
import { createResultsView } from './view';

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
    return new Set(providerAvailability.filter((source) => !repositoryEnabled(source, choices)).map((source) => source.id));
  },
});

let generation = 0;
async function runSearch() {
  const current = ++generation;
  const query = input.value;
  const expandedMode = expanded.checked;
  view.search('');
  let choices: Record<string, boolean>;
  try { choices = await readRepositories(); } catch {
    if (current === generation) document.querySelector('#storage-status')!.textContent = 'Repository settings could not be read. Search was not started.';
    return;
  }
  if (current !== generation) return;
  const links = document.querySelector<HTMLElement>('#native-searches')!;
  links.hidden = !query;
  links.replaceChildren(...providerAvailability.filter((source) => repositoryEnabled(source, choices)).map((source) => {
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
  document.querySelector('#fallback-status')!.replaceChildren(...providerAvailability.filter((source) => source.classification === 'D' && repositoryEnabled(source, choices)).map((source) => {
    const item = document.createElement('li');
    item.textContent = `${source.name}: direct search only — ${source.reason}`;
    return item;
  }));
  document.querySelector('#search-summary')!.textContent = query
    ? `Search: “${query}” · Expanded Search ${expandedMode ? 'on' : 'off'}`
    : 'Enter a query to start a search.';
  document.querySelector('#storage-status')!.textContent = '';
  if (query) {
    void rememberSearch(query).catch(() => {
      if (current === generation) document.querySelector('#storage-status')!.textContent = 'Search history could not be saved on this device.';
    });
  }
  view.search(query, new Set(providerAvailability.filter((source) => !repositoryEnabled(source, choices)).map((source) => source.id)));
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
window.addEventListener('pagehide', () => { generation++; view.cancel(); });
void runSearch();
