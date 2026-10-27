// SPDX-License-Identifier: GPL-3.0-or-later
import { vi } from 'vitest';

/** Fake extension API, with serialization like storage.local and no real credentials. */
export function mockExtensionStorage() {
  const data: Record<string, unknown> = {};
  const local = {
    get: vi.fn(async (key: string): Promise<Record<string, unknown>> => structuredClone({ [key]: data[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }),
    remove: vi.fn(async (key: string) => { delete data[key]; }),
  };
  const sync = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('chrome', { storage: { local, sync } });
  return { data, local, sync };
}
