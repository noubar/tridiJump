// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider } from './provider';
import { credentialsConfigured } from './credentials';
import { repositoryEnabled } from '../shared/preferences';

export interface RepositorySource {
  id: string;
  available?: boolean;
  defaultEnabled?: boolean;
  createProvider?: () => Provider;
}

/** Credential presence is availability, while the saved repository choice remains a separate preference. */
export interface RepositoryState {
  supported: boolean;
  requiresCredentials: boolean;
  /** Undefined only when a caller intentionally skips credential I/O for a user-disabled provider. */
  credentialsConfigured: boolean | undefined;
  available: boolean;
  userEnabled: boolean;
  searchEnabled: boolean;
}

export async function resolveRepositoryState(
  source: RepositorySource,
  choices: Record<string, boolean>,
  options: { checkDisabledCredentials?: boolean } = {},
): Promise<RepositoryState> {
  const supported = source.available !== false;
  const provider = source.createProvider?.();
  const fields = provider?.credentialFields ?? [];
  const requiresCredentials = fields.length > 0;
  const userEnabled = repositoryEnabled(source, choices);
  const configured = !requiresCredentials ? true
    : !userEnabled && options.checkDisabledCredentials === false ? undefined
    : await credentialsConfigured(source.id, fields);
  const available = supported && configured === true;
  return {
    supported,
    requiresCredentials,
    credentialsConfigured: configured,
    available,
    userEnabled,
    searchEnabled: available && userEnabled,
  };
}

export async function resolveRepositoryStates<T extends RepositorySource>(
  sources: readonly T[],
  choices: Record<string, boolean>,
  options: { checkDisabledCredentials?: boolean } = {},
): Promise<Map<string, RepositoryState>> {
  const states = await Promise.all(sources.map(async (source) =>
    [source.id, await resolveRepositoryState(source, choices, options)] as const));
  return new Map(states);
}
