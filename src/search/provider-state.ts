// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModelResult } from '../shared/model-result';

/** State for one provider search. The caller owns timeouts and state updates. */
export type ProviderSearchState = { providerId: string } & (
  | { status: 'idle' | 'disabled' }
  // Configuration is missing; no search has been attempted and this is not an error.
  | { status: 'setup-required' }
  | { status: 'searching'; query: string }
  | { status: 'success'; query: string; results: ModelResult[] }
  | { status: 'no-results'; query: string }
  | { status: 'failed'; query: string; error: string }
  | { status: 'timed-out'; query: string }
);

export type ProviderSearchStatus = ProviderSearchState['status'];
