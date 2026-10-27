// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModelResult } from '../shared/model-result';

export interface Provider {
  /** Stable identifier matching providerId on every returned result. */
  id: string;
  /**
   * Return normalized results, or [] for a successful search with no matches.
   * Keep all repository transport, parsing, and field mapping inside the provider.
   * Reject on failure; honor a supplied signal, including an already-aborted one,
   * and reject cancellation with an AbortError. Do not turn errors into [].
   * The caller may attach query provenance if the provider does not supply it.
   */
  search(query: string, signal?: AbortSignal): Promise<ModelResult[]>;
}
