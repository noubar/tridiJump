// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { initializeSearchForm } from '../search/form';
import { readPreferences } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';
import { providerAvailability } from '../providers/availability';
import { credentialsConfigured } from '../providers/credentials';

initializeTheme();
initializeSearchForm(document.querySelector<HTMLFormElement>('#search-form')!, readPreferences().expandedDefault);
const sources = providerAvailability.flatMap((source) => 'createProvider' in source ? [source.createProvider()] : []);
void Promise.allSettled(sources.map((provider) => credentialsConfigured(provider.id, provider.credentialFields!))).then((states) => {
  const configured = states.filter((state) => state.status === 'fulfilled' && state.value).length;
  document.querySelector('#repository-count')!.textContent = `${configured} of ${sources.length} API repositories configured · 6 native-search links available`
    + (states.some((state) => state.status === 'rejected') ? ' · some configuration could not be read' : '');
});
