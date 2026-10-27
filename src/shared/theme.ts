// SPDX-License-Identifier: GPL-3.0-or-later
import { PREFERENCES_KEY, readPreferences } from './preferences';
import type { Theme } from './preferences';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function initializeTheme(): void {
  applyTheme(readPreferences().theme);
  window.addEventListener('storage', (event) => {
    if (event.key === PREFERENCES_KEY || event.key === null) {
      applyTheme(readPreferences().theme);
    }
  });
}
