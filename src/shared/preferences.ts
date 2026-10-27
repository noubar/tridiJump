// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeQuery } from '../search/query';

export type Theme = 'system' | 'light' | 'dark';
export interface Preferences {
  theme: Theme;
  expandedDefault: boolean;
  historyEnabled: boolean;
}

export const PREFERENCES_KEY = 'tridijump.preferences';
export const HISTORY_KEY = 'tridijump.history';
export const HISTORY_LIMIT = 20;

export function readPreferences(): Preferences {
  let value: Partial<Preferences> | null = null;
  try {
    value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
  } catch { /* Missing or unavailable storage uses safe defaults. */ }
  return {
    theme: value?.theme === 'light' || value?.theme === 'dark' ? value.theme : 'system',
    expandedDefault: value?.expandedDefault === true,
    historyEnabled: value?.historyEnabled === true,
  };
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function readHistory(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string')
        .map(normalizeQuery).filter(Boolean))].slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string): void {
  const normalized = normalizeQuery(query);
  if (!normalized || !readPreferences().historyEnabled) return;
  const history = [normalized, ...readHistory().filter((item) => item !== normalized)];
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
