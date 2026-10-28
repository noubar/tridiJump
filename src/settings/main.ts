// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { clearHistory, readHistory, readPreferences, savePreferences, PREFERENCES_KEY, HISTORY_KEY } from '../shared/preferences';
import type { Theme } from '../shared/preferences';
import { applyTheme, initializeTheme } from '../shared/theme';
import { cultsCredentialFields } from '../providers/cults3d';
import { initializeCredentialSettings } from './provider-credentials';
import { providerAvailability } from '../providers/availability';

initializeTheme();
// Preserve removal of previously stored keys, but do not collect new credentials
// or imply they can enable an integration whose eligibility is unconfirmed.
void initializeCredentialSettings(document.querySelector('#provider-cults3d')!, 'cults3d', cultsCredentialFields, { allowSave: false });
document.querySelector('#repository-availability')!.replaceChildren(...providerAvailability.map((source) => {
  const item = document.createElement('li');
  item.textContent = `${source.name}: direct search only. ${source.reason}`;
  return item;
}));
const form = document.querySelector<HTMLFormElement>('#settings-form')!;
const expanded = document.querySelector<HTMLInputElement>('#expanded-default')!;
const historyEnabled = document.querySelector<HTMLInputElement>('#history-enabled')!;
const theme = document.querySelector<HTMLSelectElement>('#theme')!;
const status = document.querySelector('#settings-status')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-history')!;

function renderHistory() {
  const history = readHistory();
  const list = document.querySelector('#history-list')!;
  list.replaceChildren(...history.map((query) => {
    const item = document.createElement('li');
    item.textContent = query;
    return item;
  }));
  document.querySelector<HTMLElement>('#history-empty')!.hidden = history.length > 0;
  clearButton.disabled = history.length === 0;
}

function loadPreferences() {
  const preferences = readPreferences();
  expanded.checked = preferences.expandedDefault;
  historyEnabled.checked = preferences.historyEnabled;
  theme.value = preferences.theme;
}

loadPreferences();
renderHistory();
form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if (!historyEnabled.checked) clearHistory();
    const preferences = { expandedDefault: expanded.checked, historyEnabled: historyEnabled.checked, theme: theme.value as Theme };
    savePreferences(preferences);
    applyTheme(preferences.theme);
    renderHistory();
    status.textContent = 'Settings saved on this device.';
  } catch {
    status.textContent = 'Settings could not be saved. Local storage may be unavailable or full.';
  }
});
clearButton.addEventListener('click', () => {
  try {
    clearHistory();
    renderHistory();
    status.textContent = 'Search history cleared.';
  } catch {
    status.textContent = 'Search history could not be cleared.';
  }
});
window.addEventListener('storage', (event) => {
  if (event.key === PREFERENCES_KEY || event.key === null) loadPreferences();
  if (event.key === HISTORY_KEY || event.key === null) renderHistory();
});
