// SPDX-License-Identifier: GPL-3.0-or-later
import '../shared/styles.css';
import { initializeSearchForm } from '../search/query';
import { readPreferences } from '../shared/preferences';
import { initializeTheme } from '../shared/theme';

initializeTheme();
initializeSearchForm(document.querySelector<HTMLFormElement>('#search-form')!, readPreferences().expandedDefault);
