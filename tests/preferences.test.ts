// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHistory, HISTORY_KEY, HISTORY_LIMIT, PREFERENCES_KEY, readHistory, readPreferences,
  rememberSearch, savePreferences, readRepositories, repositoryEnabled, setRepositoryEnabled } from '../src/shared/preferences';
import { initializeTheme } from '../src/shared/theme';
import { mockExtensionStorage } from './helpers/extension-storage';
let storage: ReturnType<typeof mockExtensionStorage>;
beforeEach(() => { localStorage.clear(); storage = mockExtensionStorage(); });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });
describe('extension-local preferences', () => {
  it('defaults safely and persists only declared preferences', async () => {
    expect(await readPreferences()).toEqual({ theme: 'system', expandedDefault: false, historyEnabled: false });
    const input = { theme: 'dark' as const, expandedDefault: true, historyEnabled: true, apiKey: 'FAKE-SECRET' };
    await savePreferences(input);
    expect(await readPreferences()).toEqual({ theme: 'dark', expandedDefault: true, historyEnabled: true });
    expect(JSON.stringify(storage.data)).not.toContain(input.apiKey);
    expect(storage.sync.set).not.toHaveBeenCalled();
    storage.data[PREFERENCES_KEY] = { theme: 'unknown', historyEnabled: 'true' };
    expect(await readPreferences()).toEqual({ theme: 'system', expandedDefault: false, historyEnabled: false });
  });
  it('migrates and removes legacy settings/history only after successful local writes', async () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: 'light', expandedDefault: true, apiKey: 'FAKE-LEGACY-SECRET' }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(['cap', 'cap', null]));
    storage.local.set.mockRejectedValueOnce(new Error('unavailable'));
    await expect(readPreferences()).rejects.toThrow('could not be read');
    expect(localStorage.getItem(PREFERENCES_KEY)).not.toBeNull();
    expect((await readPreferences()).theme).toBe('light');
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
    expect(await readHistory()).toEqual(['cap']);
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    expect(JSON.stringify(storage.data)).not.toContain('FAKE-LEGACY-SECRET');
  });
  it('keeps extension preferences authoritative over old values', async () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: 'dark' }));
    await savePreferences({ theme: 'light', expandedDefault: false, historyEnabled: false });
    expect((await readPreferences()).theme).toBe('light');
  });
  it('reports storage failures with sanitized messages', async () => {
    storage.local.get.mockRejectedValue(new Error('FAKE-SECRET'));
    await expect(readPreferences()).rejects.toThrow('Local settings could not be read.');
    storage.local.set.mockRejectedValue(new Error('FAKE-SECRET'));
    await expect(savePreferences({ theme: 'system', expandedDefault: false, historyEnabled: false })).rejects.toThrow('Local settings could not be saved.');
  });
  it.each([true, false])('persists Expanded Search default %s', async (expandedDefault) => {
    await savePreferences({ theme: 'system', expandedDefault, historyEnabled: false });
    expect((await readPreferences()).expandedDefault).toBe(expandedDefault);
  });
  it.each(['system', 'light', 'dark'] as const)('updates open pages for %s, ignores sync changes and cleans up', async (theme) => {
    const stop = await initializeTheme();
    await savePreferences({ theme, expandedDefault: false, historyEnabled: false });
    expect(document.documentElement.dataset.theme).toBe(theme);
    storage.emit({ [PREFERENCES_KEY]: { newValue: { theme: 'invalid' } } }, 'sync');
    expect(document.documentElement.dataset.theme).toBe(theme);
    stop();
    expect(storage.onChanged.removeListener).toHaveBeenCalled();
  });
});
describe('repository preferences', () => {
  it('defaults new entries on, preserves older selections and respects trusted unavailability', async () => {
    await setRepositoryEnabled('thingiverse', false);
    await setRepositoryEnabled('cults3d', true);
    const choices = await readRepositories();
    expect(repositoryEnabled({ id: 'thingiverse' }, choices)).toBe(false);
    expect(repositoryEnabled({ id: 'cults3d' }, choices)).toBe(true);
    expect(repositoryEnabled({ id: 'new-official-entry' }, choices)).toBe(true);
    expect(repositoryEnabled({ id: 'cults3d', available: false }, choices)).toBe(false);
    await setRepositoryEnabled('new-official-entry', false);
    expect((await readRepositories()).thingiverse).toBe(false);
  });
});
describe('local history', () => {
  it('is opt-in, bounded to 50, deduplicated, retained when disabled and explicitly cleared', async () => {
    await rememberSearch('not saved');
    expect(await readHistory()).toEqual([]);
    await savePreferences({ theme: 'system', expandedDefault: false, historyEnabled: true });
    await Promise.all(Array.from({ length: 60 }, (_, i) => rememberSearch(`cap ${i}`)));
    await rememberSearch(' cap 59 ');
    expect(await readHistory()).toHaveLength(HISTORY_LIMIT);
    expect((await readHistory())[0]).toBe('cap 59');
    await savePreferences({ theme: 'system', expandedDefault: false, historyEnabled: false });
    await rememberSearch('not saved either');
    expect(await readHistory()).toHaveLength(50);
    await clearHistory();
    expect(await readHistory()).toEqual([]);
  });
  it('does not resurrect legacy history after clearing, or pending writes', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(['legacy']));
    await savePreferences({ theme: 'system', expandedDefault: false, historyEnabled: true });
    const pending = rememberSearch('cap');
    const clear = clearHistory();
    await Promise.all([pending, clear]);
    expect(await readHistory()).toEqual([]);
  });
});
