// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { initializeSearchForm } from '../search/form';
import { readPreferences, readRepositories, repositoryEnabled } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';
import { providerAvailability } from '../providers/availability';
import { credentialsConfigured } from '../providers/credentials';

void initializeTheme();
initializeSearchForm(document.querySelector<HTMLFormElement>('#search-form')!, (await readPreferences().catch(() => ({ expandedDefault: false }))).expandedDefault);
async function renderRepositoryCount() {
  const count = document.querySelector('#repository-count')!;
  try {
    const choices = await readRepositories();
    const enabled = providerAvailability.filter((source) => repositoryEnabled(source, choices));
    const sources = enabled.flatMap((source) => 'createProvider' in source ? [source.createProvider()] : []);
    const states = await Promise.allSettled(sources.map((provider) => credentialsConfigured(provider.id, provider.credentialFields!)));
    const configured = states.filter((state) => state.status === 'fulfilled' && state.value).length;
    count.textContent = `${configured} of ${sources.length} API repositories configured / ${enabled.length} repositories enabled`
      + (states.some((state) => state.status === 'rejected') ? ' / some configuration could not be read' : '');
  } catch { count.textContent = 'Repository settings could not be read. Open Settings to try again.'; }
}
void renderRepositoryCount();
