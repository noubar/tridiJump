// SPDX-License-Identifier: GPL-3.0-or-later
import { vi } from 'vitest';

/** Fake extension API, with serialization like storage.local and no real credentials. */
export function mockExtensionStorage() {
  const data: Record<string, unknown> = {};
  type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
  const listeners = new Set<(changes: Changes, area: string) => void>();
  const emit = (changes: Changes, area = 'local') => { for (const listener of listeners) listener(changes, area); };
  const onChanged = { addListener: vi.fn((listener: (changes: Changes, area: string) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (changes: Changes, area: string) => void) => listeners.delete(listener)) };
  const local = {
    get: vi.fn(async (key: string): Promise<Record<string, unknown>> => structuredClone({ [key]: data[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => { const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { oldValue: data[key], newValue }]));
      Object.assign(data, structuredClone(values)); emit(structuredClone(changes)); }),
    remove: vi.fn(async (key: string) => { const oldValue = data[key]; delete data[key]; emit({ [key]: { oldValue } }); }),
  };
  const sync = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('chrome', { storage: { local, sync, onChanged } });
  return { data, local, sync, emit, onChanged };
}
