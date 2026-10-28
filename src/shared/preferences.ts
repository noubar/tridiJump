// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeQuery } from '../search/query';
import { extensionLocal } from './extension-storage';
export type Theme = 'system' | 'light' | 'dark';
export interface Preferences { theme: Theme; expandedDefault: boolean; historyEnabled: boolean }
export const PREFERENCES_KEY = 'tridijump.preferences';
export const HISTORY_KEY = 'tridijump.history';
export const REPOSITORIES_KEY = 'tridijump.repositories';
export const HISTORY_LIMIT = 50;
export function normalizePreferences(value: unknown): Preferences {
  const data = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  return { theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : 'system',
    expandedDefault: data.expandedDefault === true, historyEnabled: data.historyEnabled === true };
}
async function read(key: string, legacy = false): Promise<unknown> {
  try {
    const local = extensionLocal();
    const stored = (await local.get(key))[key];
    if (stored !== undefined || !legacy) return stored;
    let text: string | null | undefined;
    try { text = globalThis.localStorage?.getItem(key); } catch { /* Legacy storage can be unavailable. */ }
    if (text == null) return;
    let value: unknown;
    try { value = JSON.parse(text); } catch { return; }
    const normalized = key === PREFERENCES_KEY ? normalizePreferences(value) : normalizeHistory(value);
    await local.set({ [key]: normalized });
    try { globalThis.localStorage?.removeItem(key); } catch { /* Migration already succeeded. */ }
    return normalized;
  } catch { throw new Error('Local settings could not be read.'); }
}
async function write(key: string, value: unknown): Promise<void> {
  try { await extensionLocal().set({ [key]: value }); }
  catch { throw new Error('Local settings could not be saved.'); }
}
export async function readPreferences(): Promise<Preferences> {
  return withLocalLock(PREFERENCES_KEY, async () => normalizePreferences(await read(PREFERENCES_KEY, true)));
}
export async function savePreferences(value: Preferences): Promise<void> {
  return withLocalLock(PREFERENCES_KEY, () => write(PREFERENCES_KEY, normalizePreferences(value)));
}
function normalizeHistory(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string')
    .map(normalizeQuery).filter(Boolean))].slice(0, HISTORY_LIMIT) : [];
}
export async function readHistory(): Promise<string[]> {
  return withLocalLock(HISTORY_KEY, async () => normalizeHistory(await read(HISTORY_KEY, true)));
}
let historyWrites: Promise<void> = Promise.resolve();
/** Extension pages share an origin, but not module-level queues. */
function withLocalLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(name, operation) : operation();
}
function queueHistory(operation: () => Promise<void>): Promise<void> {
  const pending = historyWrites.then(() => withLocalLock(HISTORY_KEY, operation));
  historyWrites = pending.catch(() => {});
  return pending;
}
export function rememberSearch(query: string): Promise<void> {
  const normalized = normalizeQuery(query);
  return queueHistory(async () => {
    if (!normalized || !(await readPreferences()).historyEnabled) return;
    // Already holding the history lock; do not acquire it recursively.
    await write(HISTORY_KEY, normalizeHistory([normalized, ...normalizeHistory(await read(HISTORY_KEY, true))]));
  });
}
export function clearHistory(): Promise<void> { return queueHistory(() => write(HISTORY_KEY, [])); }
export async function readRepositories(): Promise<Record<string, boolean>> {
  const value = await read(REPOSITORIES_KEY);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([id, enabled]) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) && typeof enabled === 'boolean')) : {};
}
/** Availability comes exclusively from packaged metadata. Missing IDs default on. */
export function repositoryEnabled(source: { id: string; available?: boolean }, choices: Record<string, boolean>): boolean {
  return source.available !== false && (!Object.hasOwn(choices, source.id) || choices[source.id] === true);
}
let repositoryWrites: Promise<void> = Promise.resolve();
export function setRepositoryEnabled(id: string, enabled: boolean): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return Promise.reject(new Error('Invalid repository.'));
  const pending = repositoryWrites.then(() => withLocalLock(REPOSITORIES_KEY, async () => {
    await write(REPOSITORIES_KEY, { ...await readRepositories(), [id]: enabled });
  }));
  repositoryWrites = pending.catch(() => {});
  return pending;
}
