# tridiJump

A lightweight browser extension for searching multiple 3D-model repositories
asynchronously and displaying models on one unified results page.

The V1 application shell includes a search popup, results layout, and settings.
Provider searching and synonym expansion are not implemented. Results show an
empty state, with no demo models or network requests.

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
extension-origin `localStorage` on this device; nothing is synced or sent away.

There are currently zero available repositories. Repository selection, result
sorting, and model filters remain empty or disabled until providers exist.

```sh
npm test             # Run Vitest checks
npm run test:watch   # Watch tests
npm run typecheck   # Strict TypeScript checks
npm run build       # Type check and production build
```

## Structure

- `src/popup/`, `src/results/`, `src/settings/`: plain HTML/TypeScript entry pages
- `src/shared/`: normalized model result type, preferences, theme, and styles
- `src/search/`: query parsing, native form setup, search states, and orchestration
- `src/providers/`: minimal provider contract; no repository implementations yet
- `src/synonyms/`: reserved for later implementation
- `providers/`: reserved for provider definitions
- `public/manifest.json`: Manifest V3 configuration, copied to `dist/`
- `tests/`: extension foundation checks

Uses TypeScript, plain HTML/CSS, Vite, and Vitest. No runtime dependencies,
framework, backend, accounts, analytics, telemetry, cloud storage, AI APIs, or
remote executable code. The foundation requests no extension or host permissions.

## Domain and provider contract

`ModelResult` (`src/shared/model-result.ts`) requires only `title`, `url`, and
`providerId`. Optional fields cover a provider-local string ID, thumbnail URL,
creator, price (amount in major units plus ISO currency code), explicit `isFree`,
file formats, ISO creation date, popularity, downloads, and a rating on a 0–5
scale. Omit unavailable metadata; do not substitute zero, an empty string, or
`false` for unknown values. Popularity remains provider-specific. An optional
`query` records the exact term that found a model, including an expanded term.

`Provider` (`src/providers/provider.ts`) has just a stable `id` and
`search(query: string, signal?: AbortSignal): Promise<ModelResult[]>`. Each
provider owns its transport, API/HTML details, and normalization. Returned
`providerId` values must match its ID. Successful searches without matches return
`[]`; failures reject, and cancellation rejects with an `AbortError`. Providers
honor an optional signal, including one already aborted. The caller may attach
query provenance when needed.

`ProviderSearchState` (`src/search/provider-state.ts`) distinguishes `idle`,
`searching`, `success`, `no-results`, `failed`, `timed-out`, and `disabled`.
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
not execute providers. Disabled providers are omitted by the caller. No providers
are registered or connected to the UI yet; mocks exist only in automated tests.

## License

SPDX-License-Identifier: GPL-3.0-or-later

Copyright (C) 2026 tridiJump contributors.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full terms.
