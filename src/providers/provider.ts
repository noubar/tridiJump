// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModelResult } from '../shared/model-result';
import type { CredentialField } from './credentials';

export type ProviderMode = 'remote-api' | 'local-catalog' | 'direct-search';

export interface ResultPage {
  results: ModelResult[];
  /** Opaque continuation owned by the adapter, never a remotely supplied URL. */
  nextCursor?: string;
}

export interface Provider {
  /** Stable identifier matching providerId on every returned result. */
  id: string;
  /** Retrieval mode metadata; packaged adapters use remote-api. */
  mode?: ProviderMode;
  /** Required configuration fields only; never credential values. Omit for anonymous providers. */
  credentialFields?: readonly CredentialField[];
  /**
   * Return normalized results, or [] for a successful search with no matches.
   * Keep all repository transport, parsing, and field mapping inside the provider.
   * Reject on failure; honor a supplied signal, including an already-aborted one,
   * and reject cancellation with an AbortError. Do not turn errors into [].
   * The caller may attach query provenance if the provider does not supply it.
   */
  search(query: string, signal?: AbortSignal): Promise<ModelResult[]>;
  /** Optional incremental interface. Undefined cursor requests the first page. */
  searchPage?(query: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage>;
}
