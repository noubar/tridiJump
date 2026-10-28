// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, expect, it, vi } from 'vitest';
import { mockExtensionStorage } from './helpers/extension-storage';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

// Model the browser's shared, per-origin Web Locks service across two page modules.
function sharedLocks() {
  const tails = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, operation: () => Promise<unknown>) => {
    const next = (tails.get(name) ?? Promise.resolve()).then(operation);
    tails.set(name, next.catch(() => {}));
    return next;
  });
  vi.stubGlobal('navigator', { locks: { request } });
}

async function pages(key: string, initial: unknown) {
  sharedLocks();
  const storage = mockExtensionStorage(); storage.data[key] = initial;
  storage.data['tridijump.preferences'] = { theme: 'system', expandedDefault: false, historyEnabled: true };
  let release!: () => void; let entered!: () => void; let block = true;
  const reading = new Promise<void>((resolve) => { entered = resolve; });
  storage.local.get.mockImplementation(async (requested) => {
    const captured = structuredClone({ [requested]: storage.data[requested] });
    if (requested === key && block) {
      block = false; entered();
      await new Promise<void>((resolve) => { release = resolve; });
    }
    return captured;
  });
  vi.resetModules(); const a = await import('../src/shared/preferences');
  vi.resetModules(); const b = await import('../src/shared/preferences');
  return { a, b, storage, reading, release: () => release() };
}

it('a clear in another extension page cannot be undone by an older pending history read', async () => {
  const { a, b, storage, reading, release } = await pages('tridijump.history', ['older query']);
  const remember = a.rememberSearch('new query'); await reading;
  const clear = b.clearHistory();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  release(); await Promise.all([remember, clear]);
  expect(storage.data['tridijump.history']).toEqual([]);
});

it('independent Settings pages cannot silently lose each other\'s repository disable choices', async () => {
  const { a, b, storage, reading, release } = await pages('tridijump.repositories', {});
  const first = a.setRepositoryEnabled('thingiverse', false); await reading;
  const second = b.setRepositoryEnabled('cults3d', false);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  release(); await Promise.all([first, second]);
  expect(storage.data['tridijump.repositories']).toEqual({ thingiverse: false, cults3d: false });
});

it('a pending legacy-history migration cannot resurrect history cleared in another page', async () => {
  const { a, b, storage, reading, release } = await pages('tridijump.history', undefined);
  localStorage.setItem('tridijump.history', JSON.stringify(['legacy query']));
  const migrating = a.readHistory(); await reading;
  const clear = b.clearHistory();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  release(); await Promise.all([migrating, clear]);
  expect(storage.data['tridijump.history']).toEqual([]);
});

it('a delayed legacy preference migration cannot overwrite a newer explicit Settings save', async () => {
  const { a, b, storage, reading, release } = await pages('tridijump.preferences', undefined);
  delete storage.data['tridijump.preferences'];
  localStorage.setItem('tridijump.preferences', JSON.stringify({ theme: 'dark', expandedDefault: false, historyEnabled: false }));
  const migrating = a.readPreferences(); await reading;
  const preferences = { theme: 'light' as const, expandedDefault: true, historyEnabled: true };
  const saving = b.savePreferences(preferences);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  release(); await Promise.all([migrating, saving]);
  expect(storage.data['tridijump.preferences']).toEqual(preferences);
});
