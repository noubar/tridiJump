// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { clearHistory, readHistory, readPreferences, savePreferences, PREFERENCES_KEY, HISTORY_KEY,
  readRepositories, repositoryEnabled, setRepositoryEnabled, REPOSITORIES_KEY } from '../shared/preferences';
import type { Theme } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';
import { observeLocal } from '../shared/extension-storage';
import { initializeCredentialSettings } from './provider-credentials';
import { credentialsConfigured } from '../providers/credentials';
import { providerAvailability } from '../providers/availability';
void initializeTheme();
for (const source of providerAvailability) {
  if ('createProvider' in source) {
    const provider = source.createProvider();
    if (provider.credentialFields?.length) void initializeCredentialSettings(document.querySelector(`#provider-${source.id}`)!, source.id, provider.credentialFields);
  }
}
const form = document.querySelector<HTMLFormElement>('#settings-form')!;
const expanded = document.querySelector<HTMLInputElement>('#expanded-default')!;
const historyEnabled = document.querySelector<HTMLInputElement>('#history-enabled')!;
const theme = document.querySelector<HTMLSelectElement>('#theme')!;
const status = document.querySelector('#settings-status')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-history')!;
const repositoryNotes = new Map<string, HTMLElement>();
const repositoryInputs = new Map<string, HTMLInputElement>();
for (const source of providerAvailability) {
  const item = document.createElement('li');
  const label = document.createElement('label');
  label.className = 'check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `repository-${source.id}`;
  input.disabled = true;
  label.htmlFor = input.id;
  label.append(input, document.createTextNode(source.name));
  const note = document.createElement('span');
  note.className = 'hint';
  note.textContent = source.classification === 'D' ? 'Direct search only' : source.classification === 'A'
    ? source.reason : 'Aggregation available; configure credentials below';
  item.append(label, note);
  document.querySelector('#repository-availability')!.append(item);
  repositoryInputs.set(source.id, input);
  repositoryNotes.set(source.id, note);
  input.addEventListener('change', () => {
    input.disabled = true;
    void setRepositoryEnabled(source.id, input.checked).then(() => {
      status.textContent = 'Repository preference saved. Applies to your next search.';
    }, () => { input.checked = !input.checked; status.textContent = 'Repository preference could not be saved.'; })
      .finally(() => { input.disabled = false; });
  });
}
async function renderHistory() {
  const history = await readHistory();
  document.querySelector('#history-list')!.replaceChildren(...history.map((query) => {
    const item = document.createElement('li'); item.textContent = query; return item;
  }));
  document.querySelector<HTMLElement>('#history-empty')!.hidden = history.length > 0;
  clearButton.disabled = history.length === 0;
}
async function loadPreferences() {
  const preferences = await readPreferences();
  expanded.checked = preferences.expandedDefault;
  historyEnabled.checked = preferences.historyEnabled;
  theme.value = preferences.theme;
}
async function loadRepositories() {
  const choices = await readRepositories();
  await Promise.all(providerAvailability.map(async (source) => {
    const input = repositoryInputs.get(source.id)!;
    input.checked = repositoryEnabled(source, choices);
    input.disabled = !repositoryEnabled(source, {});
    const enabled = input.checked;
    const configured = 'createProvider' in source && source.createProvider().credentialFields?.length
      ? await credentialsConfigured(source.id, source.createProvider().credentialFields!) : undefined;
    repositoryNotes.get(source.id)!.textContent = `${enabled ? 'Enabled' : 'Disabled'} / ${source.classification === 'A' ? source.reason : configured === undefined ? 'Direct search only' : configured ? 'Configured' : 'Setup required'}`;
  }));
}
function reportReadError() { status.textContent = 'Some local settings could not be read. Try reopening Settings.'; }
for (const control of [expanded, historyEnabled, theme]) control.disabled = true;
void loadPreferences().then(() => { for (const control of [expanded, historyEnabled, theme]) control.disabled = false; }, reportReadError);
void loadRepositories().catch(reportReadError);
void renderHistory().catch(reportReadError);
form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('change', () => {
  const preferences = { expandedDefault: expanded.checked, historyEnabled: historyEnabled.checked, theme: theme.value as Theme };
  void savePreferences(preferences).then(() => { status.textContent = 'Settings saved locally. Search defaults apply to new searches.'; },
    () => { status.textContent = 'Settings could not be saved.'; void loadPreferences().catch(reportReadError); });
});
clearButton.addEventListener('click', () => {
  clearButton.disabled = true;
  void clearHistory().then(renderHistory).then(() => { status.textContent = 'Search history cleared.'; },
    () => { status.textContent = 'Search history could not be cleared.'; clearButton.disabled = false; });
});
const stop = observeLocal((changes) => {
  if (Object.hasOwn(changes, PREFERENCES_KEY)) void loadPreferences().catch(reportReadError);
  if (Object.hasOwn(changes, HISTORY_KEY)) void renderHistory().catch(reportReadError);
  if (Object.hasOwn(changes, REPOSITORIES_KEY) || Object.keys(changes).some((key) => key.startsWith('tridijump.credentials.'))) void loadRepositories().catch(reportReadError);
});
window.addEventListener('pagehide', stop, { once: true });
