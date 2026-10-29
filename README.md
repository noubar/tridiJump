# tridiJump

A free and open-source Chromium browser extension for searching multiple
3D-model repositories asynchronously and displaying models on one unified
results page.

The V1 application includes a search popup, progressive results grid, and settings.
Production connects the official Cults3D, MyMiniFactory and Thingiverse APIs
using your own local credentials. Unconfigured providers show Setup required;
configured providers send actual searches and append normalized cards. Native
search remains available for all six repositories. See the
[live enablement review](docs/live-provider-enablement.md) for each access path,
source, restriction and limitation. The user has manually verified all three API
integrations live. This Settings update is verified with fixtures and mocked
extension storage; authenticated live testing was not repeated by the agent.
Expanded Search adds bounded offline English synonyms, English/German dictionary
translations, phrase reconstruction and conservative German compound searches.

Anonymous [Printables search](docs/provider-printables.md) now feeds the same grid.
The user **live verified basic Chromium search, real cards and a tested model link
on 2026-10-28**, using the packaged MV3 worker. No Printables credentials are needed.
The user has also confirmed working Printables thumbnails. This is user-run live
evidence, not an automated or agent-run browser test.
Creator, ratings, creation date, formats, prices and native orderings remain
provider-dependent. The user completed live multi-page acceptance for all four
aggregated providers on 2026-10-29. Cancellation discards late replies immediately, while an
already-started worker request may finish. See the report for the earlier CORS
finding, new thumbnail checklist and query-only rollback if the image field fails.

The V1 release blockers recorded by the historical audit were subsequently
resolved: Expanded Search is implemented, live pagination acceptance is complete,
and the MyMiniFactory credential policy records its narrow documented URL-key
exception. See the [release decision and historical audit](docs/release-audit.md),
[Expanded Search](docs/expanded-search.md) and
[privacy/network inventory](PRIVACY.md).

## Supported repositories

| Availability | Repositories | How to use |
| --- | --- | --- |
| **Works immediately** | Printables | Enable and search; no credentials. Search and thumbnails user-live-verified. |
| **Requires free provider setup** | Cults3D, MyMiniFactory, Thingiverse | Obtain your own free provider credentials and save them in Settings. |
| **Direct-search fallback** | MakerWorld, Thangs | Use the native Search directly link; models from these sources are not aggregated. |

See [supported repositories and credential setup](docs/supported-repositories.md)
for official onboarding links, fields and verification limits. Use only free API
access; current new-account key issuance is not independently confirmed for every
provider. If API access requires payment, use native search instead.

Authenticated APIs require their own account/application credentials even when
native website search is public. tridiJump does not provide or proxy credentials
and has no server receiving them. Saved keys remain in browser extension local
storage and are sent only to the corresponding repository. They are never synced
or exported. Local storage is not an encrypted password vault. You can replace or
remove credentials at any time in Settings; saved secrets are never redisplayed.

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

Settings has four areas: Repositories, Provider setup / credentials, Search, and
Appearance. Repository switches persist independently of credentials: disabling a
repository never removes its key. Re-enabling it restores searches without
re-entry. Missing credentials produce Setup required, not a failure. Disabled
repositories do not run or appear in native-search links on subsequent searches.
Results-page repository filters still only filter the current result set.

Changes save automatically; credential forms have an explicit **Save credentials**
button. Each configured provider shows a fixed secret mask with **Replace credentials**
and **Remove credentials** actions. Replacement starts with blank fields; removal
returns the next enabled search to Setup required. Cults3D uses nickname + API key;
MyMiniFactory uses API key; Thingiverse uses App Token. Official onboarding links
are in Settings. Use only your own free API access; no developer credentials are
bundled. MyMiniFactory's official API schema defines its API-key scheme as the
`key` query parameter; the working integration uses that provider-specific URL
exception. Keys are excluded from native-search links, errors and history. OAuth
is a separate registered-client/user flow, not an API-key header substitute.

All settings, history and credentials use extension `storage.local`, never sync.
Preferences and history from the older extension-origin `localStorage` are migrated
when no extension-storage value exists; legacy data is removed only after a
successful write. Credentials are never migrated through web storage. Local
extension storage is not encrypted by tridiJump or an OS credential vault. Secrets
are never prefilled, redisplayed, logged, exported or sent to tridiJump/GitHub.
Do not paste credentials into chat. Removing a key locally does not revoke it at
the provider.

Search history is off by default and keeps at most 50 unique recent original
queries, newest first. Disabling collection retains old entries; **Clear search
history** empties them. Expanded Search default applies to new entry-page searches;
explicit URL/toggle choices remain authoritative. Changing defaults never restarts
an ongoing search. When enabled, Expanded Search retains the original query and
adds up to three unique related English/German queries from bundled Open English
WordNet 2025 and TU Chemnitz Ding 1.9 indexes. It can reconstruct a phrase or
conservatively split a supported German compound while retaining product names.
Unknown terms can remain unchanged. This is not general-purpose translation.
There is no AI, runtime dictionary request or external translation service. Variant first pages run
sequentially per provider; further pages remain user-driven. History and native
fallbacks retain the original query. See [examples and limits](docs/expanded-search.md).

System/Light/Dark themes persist locally and update other open extension pages
through storage change events. System follows browser/device color preferences
through CSS. See the [Settings verification guide](docs/settings.md) for tests A-G,
storage details and the bundled metadata/authentication boundary.

Use **Search directly on…** links on the results page without a key. See the
[provider access policy](docs/provider-policy.md): user-supplied keys are welcome
for verified free APIs; paid APIs are excluded. Scraping is considered only when
permitted, with no authentication or anti-bot bypass.

Each adapter initially requests 20 models, then **Load more** requests one additional
page per eligible provider. This is a conservative client batch size, not the API
maximum or a total-results cap. Cards append progressively; disabled, unconfigured
and exhausted providers are skipped. Counts distinguish matching and loaded models.
Local filters stay active while loading additional pages. Unknown prices are never
classified as Free. Thingiverse normal model downloads are classified Free
without inventing a numeric price. MMF uses explicit store-license flags; missing
flags stay Unknown. Cults retains its reported EUR cents. Details are in
[provider pricing](docs/provider-pricing.md). See
[pagination and credential tests](docs/pagination.md) and the
[live acceptance record](docs/live-pagination-verification.md) for API mechanisms,
evidence limits and the completed manual acceptance.
Cults EUR prices are converted
from reported cents; unavailable metadata stays unknown. No model files are
downloaded. Demo code remains isolated in `src/results/demo/` for reference and
is not imported or included in the production build. Automated tests use
synthetic fixtures, never pretend-live sample cards.

See [Cults3D integration notes](docs/provider-cults3d.md) for the mechanism,
verification limits, credential requirements, and manual development checklist.
Earlier investigation notes describe development-time verification limits; the user
has since confirmed all three current API adapters working live.

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
npm run typecheck    # Strict TypeScript checks
npm run build        # Type check and production build
npm run lexicon:build # Verify pinned sources and regenerate packaged indexes
```

## Structure

- `src/popup/`, `src/results/`, `src/settings/`: plain HTML/TypeScript entry pages
- `src/results/`: safe card rendering, filter/sort helpers, and progressive view
- `src/shared/`: normalized model result type, preferences, theme, and styles
- `src/search/`: query parsing, native form setup, search states, and orchestration
- `src/providers/`: small provider contract, local credentials, three official API adapters and anonymous Printables search
- `src/synonyms/`: lazy offline lexical lookup, ranking, phrases and compounds
- `scripts/lexicon/`: deterministic OEWN/Ding source converters
- `lexical-source/`: pinned preferred-source archives, excluded from extension output
- `public/lexical-data/`: generated packaged lookup chunks and provenance
- `providers/`: reserved for provider definitions
- `public/manifest.json`: Manifest V3 configuration, copied to `dist/`
- `tests/`: extension foundation checks

Uses TypeScript, plain HTML/CSS, Vite, and Vitest. Happy DOM is a development-only
dependency for DOM rendering and progressive UI tests. No runtime dependencies,
framework, backend, tridiJump accounts, analytics, telemetry, cloud storage, AI
APIs, or remote executable code. The manifest requests only extension storage and
the four precise API origins: Cults3D, www.myminifactory.com, api.thingiverse.com,
and api.printables.com. The last permits the anonymous undocumented GraphQL interface from
the packaged Printables worker; it grants no cookies or website scripting access.
The manifest registers `background.js` as a module service worker. No additional
permission is needed for that registration; no tabs, scripting, cookies or staging
API permission is requested. The other three providers keep their existing transport.

## Domain and provider contract

Current live-integration research, access limitations, source links, and
recommendations are in [Provider investigation](docs/provider-investigation.md),
superseded for implementation status by [Live enablement review](docs/live-provider-enablement.md).

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

The optional `searchPage(query, cursor?, signal?)` method returns normalized
`results` and an opaque `nextCursor` when another batch may be available. Only the
adapter interprets that cursor; it never supplies a network destination. The core
uses this method when present, retaining `search()` compatibility for single-page
callers. `loadMore()` appends one page per eligible provider without redoing page 1.

## Search orchestration

`SearchOrchestrator` (`src/search/orchestrator.ts`) accepts a synchronous
`onUpdate(snapshot)` callback. Supply `Provider[]` to
`start(query, providers, { timeoutMs?, signal?, disabledProviderIds? })`. Each snapshot contains the
query, all provider states, and the accumulated results. Incremental adapters also
report per-provider `pages` availability/loading state. The first snapshot
clears the previous search; subsequent snapshots arrive as each provider settles,
with results appended in completion order. Render from each snapshot without
waiting for the other providers. The observer should not throw or mutate snapshots.

Every provider starts independently and has a separate abort signal and timer
(10 seconds by default). Successful empty responses become `no-results`;
missing configuration becomes `setup-required`; other rejections become `failed`;
expired timers become `timed-out` and abort only
that provider. There is no aggregate promise gating progressive updates.

Starting another search aborts the previous run. Both run identity and settled
task guards suppress late responses, including from providers that ignore abort.
`cancel()` or an external abort retains completed results and returns unfinished
providers to `idle`. Timers and external abort listeners are removed on completion
or cancellation. An already-aborted signal prevents provider execution.

Queries use the existing trimming/length rules. Duplicate provider IDs execute
only once per run (first occurrence wins). Explicitly starting again is a fresh
search, allowing refreshes without a persistent query cache. Blank queries do
not execute providers. Disabled IDs appear as `disabled` without invoking the
adapter or reading its credentials. The results
page supplies three authenticated providers and the anonymous Printables candidate.
Credential loading is covered by
cancellation and provider timeout; a superseded or timed-out read cannot launch
a request. MakerWorld and Thangs use native fallback, with their
limitations documented separately. They are not counted as successful API searches.

See the [credential security audit](docs/credential-security-audit.md) for the
credential lifecycle, fixed-origin authentication checks, Git scan and documented
MyMiniFactory request-URL exposure.

## License

SPDX-License-Identifier: GPL-3.0-or-later

Copyright (C) 2026 tridiJump contributors.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full terms.
