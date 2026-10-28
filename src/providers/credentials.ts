// SPDX-License-Identifier: GPL-3.0-or-later
import { extensionLocal } from '../shared/extension-storage';
/** Inert, packaged UI descriptions only; no values, remote code or auth templates. */
export interface CredentialField { name: string; label: string; secret: boolean }
export type ProviderCredentials = Record<string, string>;

/** Missing configuration is a non-error search outcome, never a remote failure. */
export class SetupRequired extends Error {
  constructor() { super('Provider configuration required.'); this.name = 'SetupRequired'; }
}

function key(providerId: string): string { return `tridijump.credentials.${providerId}`; }

/** Only declared fields are accepted. Never copy arbitrary settings or registry data. */
function normalize(value: unknown, fields: readonly CredentialField[]): ProviderCredentials | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const result: ProviderCredentials = {};
  for (const field of fields) {
    const item: unknown = Object.hasOwn(value, field.name)
      ? (value as Record<string, unknown>)[field.name] : undefined;
    if (typeof item !== 'string' || !item.trim()) return;
    result[field.name] = item.trim();
  }
  return result;
}

export async function loadCredentials(providerId: string, fields: readonly CredentialField[]): Promise<ProviderCredentials | undefined> {
  try {
    const stored = await extensionLocal().get(key(providerId));
    return normalize(stored[key(providerId)], fields);
  } catch { throw new Error('Provider credentials could not be read from extension local storage.'); }
}
export async function saveCredentials(providerId: string, fields: readonly CredentialField[], values: ProviderCredentials): Promise<void> {
  const normalized = normalize(values, fields);
  if (!normalized) throw new Error('Complete all credential fields.');
  try { await extensionLocal().set({ [key(providerId)]: normalized }); }
  catch { throw new Error('Provider credentials could not be saved locally.'); }
}
export async function clearCredentials(providerId: string): Promise<void> {
  try { await extensionLocal().remove(key(providerId)); }
  catch { throw new Error('Provider credentials could not be removed locally.'); }
}
export async function credentialsConfigured(providerId: string, fields: readonly CredentialField[]): Promise<boolean> {
  return (await loadCredentials(providerId, fields)) !== undefined;
}

/** This display projection never returns secret fields or their values. */
export async function credentialDisplay(providerId: string, fields: readonly CredentialField[]) {
  const values = await loadCredentials(providerId, fields);
  return { configured: !!values, publicValues: values
    ? Object.fromEntries(fields.filter((field) => !field.secret).map((field) => [field.name, values[field.name]!])) : {} };
}
