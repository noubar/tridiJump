// SPDX-License-Identifier: GPL-3.0-or-later
interface LocalArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}
export type StorageChanges = Record<string, { newValue?: unknown; oldValue?: unknown }>;
interface StorageApi {
  local?: LocalArea;
  onChanged?: {
    addListener(listener: (changes: StorageChanges, area: string) => void): void;
    removeListener(listener: (changes: StorageChanges, area: string) => void): void;
  };
}
function storage(): StorageApi | undefined {
  const extension = globalThis as typeof globalThis & {
    browser?: { storage?: StorageApi }; chrome?: { storage?: StorageApi };
  };
  return extension.browser?.storage ?? extension.chrome?.storage;
}
export function extensionLocal(): LocalArea {
  const local = storage()?.local;
  if (!local) throw new Error('Extension local storage is unavailable.');
  return local;
}
export function observeLocal(listener: (changes: StorageChanges) => void): () => void {
  const events = storage()?.onChanged;
  const handler = (changes: StorageChanges, area: string) => { if (area === 'local') listener(changes); };
  events?.addListener(handler);
  return () => events?.removeListener(handler);
}
