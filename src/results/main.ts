// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { initializeSearchForm, readSearch } from '../search/query';
import { readPreferences, rememberSearch } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';

initializeTheme();
const search = readSearch(window.location.search, readPreferences().expandedDefault);
const form = document.querySelector<HTMLFormElement>('#search-form')!;
initializeSearchForm(form, search.expanded);
(form.elements.namedItem('q') as HTMLInputElement).value = search.query;
document.querySelector('#search-summary')!.textContent = search.query
  ? `Search: “${search.query}” · Expanded Search ${search.expanded ? 'on' : 'off'}`
  : 'Enter a query to start a search.';
if (search.query) {
  try {
    rememberSearch(search.query);
  } catch {
    document.querySelector('#storage-status')!.textContent = 'Search history could not be saved on this device.';
  }
}
