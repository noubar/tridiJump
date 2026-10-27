// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { initializeSearchForm } from '../search/form';
import { readPreferences } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';
import { credentialsConfigured } from '../providers/credentials';
import { cultsCredentialFields } from '../providers/cults3d';

initializeTheme();
initializeSearchForm(document.querySelector<HTMLFormElement>('#search-form')!, readPreferences().expandedDefault);
void credentialsConfigured('cults3d', cultsCredentialFields).then((configured) => {
  document.querySelector('#repository-count')!.textContent = configured
    ? '1 API repository configured · Cults3D' : '0 API repositories configured · Cults3D setup required';
}, () => {
  document.querySelector('#repository-count')!.textContent = 'Local configuration unavailable · Cults3D direct search available';
});
