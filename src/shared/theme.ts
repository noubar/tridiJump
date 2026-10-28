// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizePreferences, PREFERENCES_KEY, readPreferences } from './preferences';
import type { Theme } from './preferences';
import { observeLocal } from './extension-storage';
export function applyTheme(theme: Theme): void { document.documentElement.dataset.theme = theme; }
export async function initializeTheme(): Promise<() => void> {
  applyTheme('system');
  let changed = false;
  const stop = observeLocal((changes) => {
    if (Object.hasOwn(changes, PREFERENCES_KEY)) {
      changed = true;
      applyTheme(normalizePreferences(changes[PREFERENCES_KEY]?.newValue).theme);
    }
  });
  window.addEventListener('pagehide', stop, { once: true });
  try { const preferences = await readPreferences(); if (!changed) applyTheme(preferences.theme); }
  catch { /* System remains usable if settings cannot be read. */ }
  return stop;
}
