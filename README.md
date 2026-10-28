# tridiJump

A lightweight browser extension for searching multiple 3D-model repositories
asynchronously and displaying models on one unified results page.

The V1 application includes a search popup, progressive results grid, and settings.
Production currently offers native-search links for all six repositories, with
per-provider reasons aggregation is unavailable. The
[current provider classifications](docs/provider-classification.md) document
access and policy evidence. Cults3D's tested GraphQL adapter is preserved but
excluded from production pending confirmation of free API access. A saved key
does not bypass this condition. Live authenticated compatibility remains pending.
Synonym expansion is not implemented.

## Development

Requires Node.js 24 or newer and npm.

```sh
npm ci
npm run dev
```

Development watches files and rebuilds `dist/`. In Chromium, open
`chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and
select `dist/`. Reload the extension after rebuilding and refresh open pages.
The extension uses packaged assets without a development server.

Enter a query in the toolbar popup and press Enter or Search to open results in
a normal browser tab. The query and Expanded Search toggle travel as encoded
URL parameters. You can edit and resubmit the search on the results page.
Settings is available from the popup, results page, and extension's **Options**
menu.

Settings include the Expanded Search default, optional local search history
(off by default, up to 20 recent queries), and System/Light/Dark themes. Use
**Save settings** to apply changes. System follows device color preferences;
saved theme changes also apply to other open extension pages. History can be
cleared, and disabling it clears existing history. Preferences and history use
extension-origin `localStorage` on this device; they are not synced.

Cults3D Settings currently permits removal of credentials saved by an earlier
development version and shows local configured status; it collects no new key
while eligibility is pending. The reusable Save/Remove mechanism is retained and
tested. Credentials use extension `storage.local` only, never sync or
preferences/history storage. Saved secrets are never prefilled. This local
storage is not encrypted by tridiJump or an OS credential vault. Do not paste
credentials into chat. No personal/developer key is bundled.

Use **Search directly on…** links on the results page without a key. See the
[provider access policy](docs/provider-policy.md): user-supplied keys are welcome
for verified free APIs; paid APIs are excluded. Scraping is considered only when
permitted, with no authentication or anti-bot bypass.

When enabled in development/tests, the Cults adapter fetches a bounded first page
of up to 20 models. EUR prices are converted
from reported cents; unavailable metadata stays unknown. No model files are
downloaded. Demo code remains isolated in `src/results/demo/` for reference and
is not imported or included in the production build. Automated tests use
synthetic fixtures, never pretend-live sample cards.

See [Cults3D integration notes](docs/provider-cults3d.md) for the mechanism,
verification limits, credential requirements, and manual development checklist.
Authenticated live search has not yet been verified with an authorized API key.

The grid mixes sources on one page and appends results as each source completes.
Cards show only a thumbnail (or placeholder), title, source, and known price/free
status. Open a card to visit its original HTTP(S) URL in a new tab.

Repository checkboxes filter the view without restarting searches. Free/Paid and
file-format filters exclude unknown metadata only when selected. The format
control stays disabled until format information exists. Best match preserves
arrival and native source ordering. Other sorts require at least two known
values and put unknown values last. Price sorts require a single reported
currency (no conversion); popularity is enabled only within one repository
because source scores are not comparable. Unavailable sorts are disabled; the
view returns to Best match if new data or filters make a selected sort unavailable.
Other choices are Latest, Most downloaded, and Highest rated.

```sh
npm test             # Run Vitest checks
npm run test:watch   # Watch tests
npm run typecheck   # Strict TypeScript checks
npm run build       # Type check and production build
```

## Structure

- `src/popup/`, `src/results/`, `src/settings/`: plain HTML/TypeScript entry pages
- `src/results/`: safe card rendering, filter/sort helpers, and progressive view
- `src/shared/`: normalized model result type, preferences, theme, and styles
- `src/search/`: query parsing, native form setup, search states, and orchestration
- `src/providers/`: minimal provider contract and isolated Cults3D implementation
- `src/synonyms/`: reserved for later implementation
- `providers/`: reserved for provider definitions
- `public/manifest.json`: Manifest V3 configuration, copied to `dist/`
- `tests/`: extension foundation checks

Uses TypeScript, plain HTML/CSS, Vite, and Vitest. Happy DOM is a development-only
dependency for DOM rendering and progressive UI tests. No runtime dependencies,
framework, backend, tridiJump accounts, analytics, telemetry, cloud storage, AI
APIs, or remote executable code. The manifest requests only extension storage
for credential status/removal. No API hosts,
tabs, scripting, cookies, or background permissions are requested.

## Domain and provider contract

Current live-integration research, access limitations, source links, and
recommendations are in [Provider investigation](docs/provider-investigation.md),
superseded for release decisions by [Provider classification](docs/provider-classification.md).

The [V1 provider architecture review](docs/provider-architecture-review.md)
records the stable search signature, boundary checks, and adapter/orchestrator regression
coverage. Its credential follow-up is now implemented with optional field
declarations, shared local storage, Settings, and non-error setup handling.
The search signature remains unchanged. API eligibility and live verification
remain distinct from architecture validation; see the integration notes for
current evidence and limitations.

`ModelResult` (`src/shared/model-result.ts`) requires only `title`, `url`, and
`providerId`. Optional fields cover a provider-local string ID, thumbnail URL,
creator, price (amount in major units plus ISO currency code), explicit `isFree`,
file formats, ISO creation date, popularity, downloads, and a rating on a 0–5
scale. Omit unavailable metadata; do not substitute zero, an empty string, or
`false` for unknown values. Popularity remains provider-specific. An optional
`query` records the exact term that found a model, including an expanded term.

`Provider` (`src/providers/provider.ts`) has just a stable `id` and
`search(query: string, signal?: AbortSignal): Promise<ModelResult[]>`. Each
provider owns its transport, API/HTML details, and normalization. Optional
`credentialFields` describes configuration fields without values. A provider
loads its own credentials before any network request and signals `SetupRequired`
when missing; the orchestrator maps that condition to `setup-required`.
Returned
`providerId` values must match its ID. Successful searches without matches return
`[]`; failures reject, and cancellation rejects with an `AbortError`. Providers
honor an optional signal, including one already aborted. The caller may attach
query provenance when needed.

`ProviderSearchState` (`src/search/provider-state.ts`) distinguishes `idle`,
`searching`, `success`, `no-results`, `failed`, `timed-out`, `disabled`, and
`setup-required`. Setup required represents missing configuration without an
error or an attempted network query; the UI links to provider Settings.
It includes the provider ID, the query for an attempted search, results on
success, and an error message on failure. `ProviderSearchStatus` exposes just
the status names. These types do not run searches or manage timeouts; those are
caller responsibilities. No registry, base class, provider-specific payloads,
or repository implementation is introduced.

## Search orchestration

`SearchOrchestrator` (`src/search/orchestrator.ts`) accepts a synchronous
`onUpdate(snapshot)` callback. Supply the enabled `Provider[]` to
`start(query, providers, { timeoutMs?, signal? })`. Each snapshot contains the
query, all provider states, and the accumulated results. The first snapshot
clears the previous search; subsequent snapshots arrive as each provider settles,
with results appended in completion order. Render from each snapshot without
waiting for the other providers. The observer should not throw or mutate snapshots.

Every provider starts independently and has a separate abort signal and timer
(10 seconds by default). Successful empty responses become `no-results`;
rejections become `failed`; expired timers become `timed-out` and abort only
that provider. There is no aggregate promise gating progressive updates.

Starting another search aborts the previous run. Both run identity and settled
task guards suppress late responses, including from providers that ignore abort.
`cancel()` or an external abort retains completed results and returns unfinished
providers to `idle`. Timers and external abort listeners are removed on completion
or cancellation. An already-aborted signal prevents provider execution.

Queries use the existing trimming/length rules. Duplicate provider IDs execute
only once per run (first occurrence wins). Explicitly starting again is a fresh
search, allowing refreshes without a persistent query cache. Blank queries do
not execute providers. Disabled providers are omitted by the caller. The results
page currently supplies no aggregation providers, including when keys are saved.
In tests, Cults credential loading is covered by cancellation and provider timeout;
a superseded or timed-out read cannot launch a request. Other adapters are not
implemented. Available authenticated adapters without local credentials produce
`setup-required`; unverified provider eligibility is a separate fallback disposition.

## License

SPDX-License-Identifier: GPL-3.0-or-later

Copyright (C) 2026 tridiJump contributors.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full terms.
