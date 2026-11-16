// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { initializeSearchForm } from '../search/form';
import { readPreferences, readRepositories } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';
import { providerAvailability } from '../providers/availability';
import { resolveRepositoryStates } from '../providers/repository-state';
import { observeLocal } from '../shared/extension-storage';

void initializeTheme();
initializeSearchForm(document.querySelector<HTMLFormElement>('#search-form')!, (await readPreferences().catch(() => ({ expandedDefault: false }))).expandedDefault);
async function renderRepositoryCount() {
  const count = document.querySelector('#repository-count')!;
  try {
    const choices = await readRepositories();
    const states = await resolveRepositoryStates(providerAvailability, choices);
    const values = [...states.values()];
    const aggregatingIds = new Set<string>(providerAvailability.filter((source) => 'createProvider' in source).map((source) => source.id));
    const readyWithoutSetup = [...states].filter(([id, state]) =>
      aggregatingIds.has(id) && state.searchEnabled && !state.requiresCredentials).length;
    const authenticated = values.filter((state) => state.requiresCredentials);
    const configured = authenticated.filter((state) => state.credentialsConfigured).length;
    const active = values.filter((state) => state.searchEnabled).length;
    count.textContent = `${readyWithoutSetup} ready without setup / ${configured} of ${authenticated.length} API repositories configured / ${active} repositories active`;
  } catch { count.textContent = 'Repository settings could not be read. Open Settings to try again.'; }
}
void renderRepositoryCount();
const stop = observeLocal((changes) => {
  if (Object.keys(changes).some((key) => key === 'tridijump.repositories' || key.startsWith('tridijump.credentials.'))) {
    void renderRepositoryCount();
  }
});
window.addEventListener('pagehide', stop, { once: true });
