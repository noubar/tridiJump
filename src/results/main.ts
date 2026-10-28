// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { readSearch } from '../search/query';
import { initializeSearchForm } from '../search/form';
import { readPreferences, rememberSearch } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';
import { providerAvailability } from '../providers/availability';
import { createResultsView } from './view';

initializeTheme();
const search = readSearch(window.location.search, readPreferences().expandedDefault);
const form = document.querySelector<HTMLFormElement>('#search-form')!;
initializeSearchForm(form, search.expanded);
const input = form.elements.namedItem('q') as HTMLInputElement;
const expanded = form.elements.namedItem('expanded') as HTMLInputElement;
input.value = search.query;
// None currently meets all V1 access/use requirements. Keep the tested adapter
// available for development, without credential reads or API dispatch in production.
const view = createResultsView(document.querySelector('main')!, []);

function runSearch() {
  const links = document.querySelector<HTMLElement>('#native-searches')!;
  links.hidden = !input.value;
  links.replaceChildren(...providerAvailability.map((source) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.searchUrl(input.value);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Search directly on ${source.name}`;
    link.dataset.providerId = source.id;
    item.append(link);
    return item;
  }));
  document.querySelector('#provider-status')!.replaceChildren(...providerAvailability.map((source) => {
    const item = document.createElement('li');
    item.textContent = `${source.name}: direct search only — ${source.reason}`;
    return item;
  }));
  document.querySelector('#search-summary')!.textContent = input.value
    ? `Search: “${input.value}” · Expanded Search ${expanded.checked ? 'on' : 'off'}`
    : 'Enter a query to start a search.';
  document.querySelector('#storage-status')!.textContent = '';
  if (input.value) {
    try {
      rememberSearch(input.value);
    } catch {
      document.querySelector('#storage-status')!.textContent = 'Search history could not be saved on this device.';
    }
  }
  view.search(input.value);
}

form.addEventListener('submit', (event) => {
  // The shared form listener validates and trims first.
  if (event.defaultPrevented) return;
  event.preventDefault();
  const params = new URLSearchParams({ q: input.value });
  if (expanded.checked) params.set('expanded', '1');
  window.history.replaceState(null, '', `?${params}`);
  runSearch();
});
window.addEventListener('pagehide', () => view.cancel());
runSearch();
