// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHistory, HISTORY_KEY, HISTORY_LIMIT, PREFERENCES_KEY, readHistory, readPreferences, rememberSearch, savePreferences } from '../src/shared/preferences';
import { applyTheme } from '../src/shared/theme';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('local preferences', () => {
  it('defaults to system theme with history and expanded search off', () => {
    expect(readPreferences()).toEqual({ theme: 'system', expandedDefault: false, historyEnabled: false });
  });

  it('round trips preferences and handles invalid stored values', () => {
    const preferences = { theme: 'dark' as const, expandedDefault: true, historyEnabled: true };
    savePreferences(preferences);
    expect(readPreferences()).toEqual(preferences);
    localStorage.setItem(PREFERENCES_KEY, '{broken');
    expect(readPreferences().theme).toBe('system');
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: 'unknown', historyEnabled: 'true' }));
    expect(readPreferences().historyEnabled).toBe(false);
    expect(readPreferences().theme).toBe('system');
  });

  it('can read safely when storage is unavailable, but reports write failures', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(readPreferences().theme).toBe('system');
    expect(readHistory()).toEqual([]);
    expect(() => savePreferences(readPreferences())).toThrow('full');
  });

  it.each(['system', 'light', 'dark'] as const)('applies the %s theme to the document', (theme) => {
    const root = { dataset: {} };
    vi.stubGlobal('document', { documentElement: root });
    applyTheme(theme);
    expect(root.dataset).toEqual({ theme });
  });
});

describe('optional search history', () => {
  it('does not record history unless enabled', () => {
    rememberSearch('bolt');
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('deduplicates recent queries, bounds history, and clears it', () => {
    savePreferences({ ...readPreferences(), historyEnabled: true });
    for (let i = 0; i < 30; i++) rememberSearch(`model ${i}`);
    rememberSearch('  model 20  ');
    rememberSearch('  ');
    expect(readHistory()).toHaveLength(HISTORY_LIMIT);
    expect(readHistory()[0]).toBe('model 20');
    expect(readHistory().filter((q) => q === 'model 20')).toHaveLength(1);
    clearHistory();
    expect(readHistory()).toEqual([]);
  });

  it('discards malformed history entries', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([null, 2, '  bolt ', 'bolt', '']));
    expect(readHistory()).toEqual(['bolt']);
    localStorage.setItem(HISTORY_KEY, '{broken');
    expect(readHistory()).toEqual([]);
  });
});
