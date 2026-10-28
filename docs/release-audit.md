# Final adversarial V1 release audit — 2026-10-28

**Historical audit; targeted follow-up:** the subsequent Expanded Search blocker
fix implements the small local EN/DE phrase map and actual Results dispatch.
See [Expanded Search](expanded-search.md) for current behavior and tests. The
original findings below are preserved; live pagination acceptance and the
MyMiniFactory URL-credential policy conflict remain unresolved. This follow-up
does not rerun or replace the full release audit.

## 1. Release verdict

**NOT READY FOR V1 RELEASE**

## 2. Executive summary

The small TypeScript/plain HTML/CSS MV3 architecture is intact. Four real
adapters feed normalized results progressively, with isolated errors and bounded
user-driven pagination. User-reported live evidence confirms search for all four
and Printables thumbnails; this audit did not repeat authenticated live tests.
Passing mocked tests cannot establish live pagination or complete V1 behavior.

## 3. Blockers

| Severity | Location | Exact problem and impact | Minimum resolution |
| --- | --- | --- | --- |
| High | `src/results/main.ts`, `src/synonyms/`, popup/Settings controls | Expanded Search is a persisted checkbox only in production. No dictionary, local phrase translation or production variant dispatch exists. `Zahnrad`, `gear`, `phone holder`, `Handyhalter`, `Raspberry Pi Gehäuse`, `raspberry pi case` search only the original input. Required V1 EN↔DE behavior is absent. | Implement a modest local phrase dictionary and bounded production dispatch, retain original, deduplicate ≤3 extra variants, test actual entry points and setup-required skipping. This is unfinished V1, not V2. |
| High | Four adapters; `docs/pagination.md`; Cults continuation query | Automated continuation tests use synthetic schemas. Live pages 2/3, >20 distinct cards, totals/exhaustion are not established by the user's first-page checkpoints. Cults `offset` support remains inferred. Users may encounter broken Load more. | Run the exact manual multipage checklist below; if Cults rejects continuation, capture the official/browser evidence and correct only that adapter. Do not invent a schema. |
| High, policy conflict | `src/providers/myminifactory.ts` | Official key protocol puts `key` in the HTTPS query string. Earlier permanent policy explicitly permits this documented exception; this audit explicitly prohibits URL credentials. The strict security criterion therefore fails even though the destination is fixed and errors/history are scrubbed. | Verify a documented browser-appropriate non-URL credential mechanism, or explicitly reconcile the conflicting product requirements before release. Do not silently send a key in an unsupported header or break working search. |

No major feature, new provider or authentication redesign was introduced to hide
these blockers.

## 4. Issues fixed during audit

| Defect / before | Small fix / after | Focused evidence |
| --- | --- | --- |
| Truncating 199 ASCII characters plus an emoji left a lone surrogate; native-link generation threw URIError before providers started. Malformed query surrogates also threw. | Normalize invalid UTF-16 and avoid cutting a surrogate pair at the 200-unit boundary. | New release-audit tests cover the boundary, malformed input and all six native URLs. |
| Popup counted anonymous Printables as an unconfigured credential provider (0 of 4). | Count anonymous availability separately from three authenticated repositories; do not read Printables credentials. | Actual popup entry-point first-run test. |
| All repositories disabled produced guidance pointing to nonexistent native links. Results checkboxes did not explain search-versus-view semantics locally. | Actionable Settings guidance; explicit loaded-card-only repository filter help. | Actual Results entry-point test for all-disabled state; existing view filter tests. |
| Production distribution omitted the GPL text. | Vite emits root LICENSE verbatim and SOURCE.txt identifying the source repository and exact-corresponding-source responsibility. | Actual in-memory production build regression test. |
| Cults request lacked the explicit no-referrer policy used elsewhere. | Add no-referrer without changing authentication/query. | All authenticated request-policy tests. |
| Separate page queues lost simultaneous repository edits; stale history/migration reads restored cleared history or overwrote newer preferences. | Same-origin Web Locks around relevant storage updates and migration reads; retain local queues and avoid recursive locks. | Four delayed two-module concurrency/migration regression tests reproduced the races and now pass. Real browser locking remains manual. |
| Current descriptions still called live Printables covers pending; manifest called the application a foundation. | Update current support/verification descriptions, distinguish historical records, document privacy and release blockers. | Source/compiled text inspection; updated status assertion. No query/schema changes. |

## 5. Provider matrix and normalization

All aggregated first pages request **20** raw items. Normalization is provider-local;
optional fields are omitted. API failures are explicit, not converted to empty
success. Each adapter has a safe native fallback. No model detail/file enrichment.

| Provider | Mode / transport / ownership | Credentials | Pagination | Price | Live evidence and limits |
| --- | --- | --- | --- | --- | --- |
| Printables | Aggregated, anonymous undocumented GraphQL; packaged worker → `api.printables.com/graphql/` | None | Raw-item offset + totalCount | Unknown | User live-confirmed search, cards, tested model link and covers. Full live pagination not confirmed; frontend schema can change. |
| Thingiverse | Aggregated when configured, else setup-required; page fetch → official `api.thingiverse.com/search/{query}` | Own App Token, local; Bearer | Page number, total or short batch | Free downloadable models; no invented numeric zero | User live-confirmed search. Legacy API/new-account issuance and live pagination remain limits. |
| MyMiniFactory | Aggregated when configured, else setup-required; page fetch → official `www.myminifactory.com/api/v2/search` | Own local API key, documented query parameter | Page number, total_count or short batch | Explicit boolean store-license flag only; otherwise Unknown | User live-confirmed search. URL-key criterion conflict; live pagination/pricing coverage not independently confirmed. |
| Cults3D | Aggregated when configured, else setup-required; page POST → official `cults3d.com/graphql` | Own local nickname + read-only key, HTTP Basic | Raw-item offset, optional total / short batch | Valid EUR cents → major units; zero Free, positive Paid | User live-confirmed first-page search. Continuation offset schema not live verified. |
| MakerWorld | Direct-search-only, no aggregation request | None in tridiJump | N/A | N/A | No verified appropriate aggregation interface in this implementation; no bypass attempted. |
| Thangs | Direct-search-only, no aggregation request | None in tridiJump | N/A | N/A | No established appropriate public catalog interface; earlier investigation records scraping restrictions. |

Metadata actually mapped:

- Printables: positive ID, name/title, slug/model URL, image.filePath → fixed
  media.printables.com path, valid likes/download counts. Creator, price, formats,
  date and rating absent. Thumbnail path rejects traversal, encoded traversal,
  external origins, query/fragment and malformed paths; invalid image keeps card.
- Thingiverse: name/title, repository model URL, optional ID, safe HTTPS thumbnail,
  creator name, valid created_at, download/like counts. No formats/rating/price.
  Free policy is supported by the [first-party April 2026 explanation](https://forum.thingiverse.com/t/thingiverse-subscription-ad-free-experience-your-ideas-wanted/96/6).
- MMF: title/model URL, optional ID, designer username, primary thumbnail or
  standard preview, likes; whitelisted extensions from returned filenames only.
  Store-license flags distinguish access, not a universal price. No creation date,
  downloads, rating or invented numeric price. See the [official schema](https://github.com/MyMiniFactory/api-documentation/blob/master/myminifactory-api.yaml).
- Cults: title/model URL, illustration, creator nick, valid download/like counts,
  EUR price from cents. No queried ID, formats, creation date or rating. URL is the
  deduplication identity when no ID exists. Publication date must not be invented
  as creation date.

All authenticated thumbnails accept safe API-returned HTTPS URLs; their domains
are not a finite CDN allowlist. All model URLs are restricted to that adapter's
expected repository hostnames. Cards render text, source and known access/price;
optional creator/counts do not clutter the card. Broken images show No preview.

Rate-limit behavior: 429 produces an isolated useful failure and a bounded local
cooldown using available Retry-After/reset headers, with no retry loop. Worker
cooldown is worker-lifetime memory. Missing credentials produce non-error
setup-required and a Configure link; disabled adapters do not read credentials.
All requests use AbortSignal. Printables caller cancellation discards the reply
immediately but does not remotely terminate an already-started worker fetch.

Native fallbacks: Printables `/search/models?q=…`; MakerWorld
`/en/search/models?keyword=…`; Thingiverse `/search?q=…&type=things`; Thangs
`/search/{encoded}?scope=thangs&view=grid`; MMF `/search/?query=…`; Cults
`/en/search?q=…`. URL helpers encode spaces, German characters, ampersands,
slashes, quotes, #, ?, emoji and repaired malformed UTF-16.

## 6. V1 feature matrix

| Feature | Status | Basis / limit |
| --- | --- | --- |
| Search | PASS | Four real production adapters; user live checkpoints |
| Progressive results | PASS | Actual production view/runner tests; no aggregate wait |
| Provider isolation | PASS | Independent error, timeout, setup and success tests |
| Cancellation | PASS | Abort plus run/settled guards; late old pages/statuses discarded |
| Pagination | PARTIAL | User-driven independent streams; synthetic multipage tests; live gate outstanding |
| Filters | PASS | All includes Unknown; Free/Paid excludes unknown; formats require data; local only |
| Sorting | PASS | Missing values last, ≥2 known values; one currency for price, one source for popularity; unsupported options disabled |
| Expanded Search | FAIL | Core can accept variants; actual page never supplies them |
| EN/DE behavior | FAIL | No dictionary or translation dispatch |
| Repository settings | PASS | Disabled means no dispatch; credentials retained; filters clearly separate |
| Credentials | PARTIAL | Lifecycle and fixed-origin tests pass; MMF URL policy unresolved |
| History | PASS | Opt-in, bounded, deduplicated, clear; race/migration fixes tested |
| Theme | PASS | Local system/light/dark; storage events; native visual check pending |
| Dynamic registry | NOT APPLICABLE | No remote loader, JSON registry, cache or registry network request exists |
| Native fallbacks | PASS | Six fixed safe destinations and encoding regressions |
| Accessibility basics | PARTIAL | Semantic controls, labels, focus CSS/status text; native keyboard/layout check unavailable |
| Privacy | PARTIAL | No tridiJump collection; explicit image/browser-history/MMF exposure documented |
| Security | PARTIAL | Fixed endpoints, text rendering, narrow permissions; strict URL-key gate fails |
| Build/package | PASS | Reproducible locked installation and generated assets; GPL now included |
| Documentation | PASS | Current implementation/support limits and historical evidence distinguished |

Best match preserves arrival/native order, not invented cross-provider relevance.
Changing sort/filter never searches again. Availability is recomputed as new
results arrive; invalidated sorts return to Best match. Latest uses actual
createdAt, not an inferred publication date. Highest rated is unavailable with
current mapped data. Numeric downloads are reported counts, not a relevance score.

Core paging advances by raw batch length even when malformed items are dropped.
Each provider/query stream owns its cursor; duplicate identities are suppressed
per provider across pages/variants. New searches clear all streams. One exhausted
or failed provider does not stop others; a failed continuation can be retried by
the user. Expanded-query stream mechanics are tested in isolation but unused by
the production page. Setup-required streams stop after one configuration check.

## 7. Security and privacy findings

Manifest: MV3, version 0.1.0 (matches package), module background.js, popup,
results and Options entries; no missing icon references. Permission **storage**
supports local preferences/history/credentials. Four host grants correspond
exactly to the API origins in the provider table. No all_urls, tabs, scripting,
cookies, content scripts or externally_connectable grant. CSP script-src self;
object-src self. Remote images are allowed; executable assets are packaged.

The worker message route accepts only the exact Printables operation and bounded
query/limit/offset from the extension's own Results page, not arbitrary fetch
URLs, headers or origins. It never reads authenticated-provider credentials.
Runtime IDs and sender URL are validated. Structured replies omit raw exceptions.

Credentials: input → declared fields → extension local → owning adapter → fixed
HTTPS origin. Save, blank Replace, fixed mask and Remove work. Disabling does not
remove a key. Headers are constructed in bundled code; redirects/cookies are
refused, no-store/no-referrer applied. Raw auth failures are replaced with useful
safe messages; returned normalized fields are checked for credential echoes.
Tests use visibly fake values. No real credential was identified in inspected
tracked source, fixtures, documentation or generated bundle. This is not proof
that arbitrary encoded secrets or all historical Git objects are clean.

There is **no remote registry implementation**. Existing adversarial metadata
tests prove packaged factories ignore untrusted endpoint/auth properties; they do
not prove malformed JSON/oversize/cache fallback handling for a nonexistent loader.
No remote data can currently alter authentication or permissions. Do not add a
loader merely to satisfy a premise that does not match this checkout.

Remote text uses textContent, safe URL construction and non-executable DOM APIs.
No remote descriptions/HTML handlers/eval/new Function/remote executable code.
HTTPS model-origin validation rejects executable schemes and credential URLs.
The full destination/data/credential inventory and normal image/navigation
privacy limits are in [PRIVACY.md](../PRIVACY.md). No analytics, telemetry, ads,
affiliate rewriting, backend, external translation or cloud storage were found.

## 8. Half-implemented, dead and stale items

- **Remaining V1 problem:** Expanded Search checkbox/preferences, empty reserved
  synonyms directory and unused production expansion dispatch. Do not claim done.
- **Remaining verification gate:** Cults offset and all live multipage/exhaustion.
- **Fixed stale wording:** Printables covers pending, popup credential count,
  foundation manifest description, all-disabled guidance and historical/current
  provider-support distinctions.
- **Valid V1 limitations:** MakerWorld/Thangs direct-only, unknown metadata,
  disabled unsupported sorts, no-preview placeholder, API new-account issuance
  uncertainty and local storage not a vault. No controls manufacture data.
- **Test/reference-only:** synthetic FAKE credentials, mocked responses and
  isolated `src/results/demo/` (including three SVGs) have no production imports
  and are absent from dist. They were retained after tracing references.
- **Reserved/V2:** empty `providers/` directory and optional remote registry are
  not hidden runtime functionality. No generated dist/node_modules are tracked.
- **Historical documents:** staged classification/architecture/Cults records now
  point to current support and audit status; dated refusal/pending observations
  are preserved as historical evidence, not erased.

## 9. Test, build and supply-chain results

Final validation in both the workspace and a separate clean locked installation:

| Command / inspection | Result |
| --- | --- |
| `npm ci --offline --no-audit --fund=false` in fresh temporary project | PASS, 90 packages; Node 24.15.0 / npm 11.6.0 |
| `npm test` | PASS, **352 tests in 24 files**, both copies |
| `npm run typecheck` | PASS, both copies |
| `npm run build` | PASS, both copies; 29 modules, 14 generated files |
| `git diff --check` | PASS; only Windows LF→CRLF advisory messages |
| `npm audit --json` | PASS, zero known vulnerabilities |
| Generated manifest/HTML/module reference inspection | PASS, 27 local references and all manifest entries exist |
| Generated LICENSE comparison | PASS, byte-for-byte root license |
| Clean build versus workspace build | PASS, all 14 files byte-identical |
| Executable bundle scan | No localhost, eval/new Function, source-map dependency, fake credentials or demo assets found |

An initial in-place `npm ci --offline --no-audit --fund=false` failed on Windows
EPERM for a loaded Lightning CSS native binary. A subsequent offline repair
attempt (`npm install --offline --no-audit --fund=false --ignore-scripts
--package-lock=false`) lacked cached package metadata. Neither is counted as a
successful clean install. A fresh temporary project with the unchanged lockfile
installed successfully; final source/config/tests were copied there and the full
suite/build passed. Missing workspace dependency files were restored from that
locked installation without replacing locked binaries. Source/lockfile versions
were unchanged. The default sandbox initially prevented the audit network call;
the approved network-enabled audit completed successfully. No user processes
were terminated. There is no separate lint script.

No dependencies added, upgraded or removed. Five direct development dependencies:
TypeScript, Vite, Vitest, Happy DOM and Node type declarations. No runtime packages.
Lockfile v3 resolves to npm's registry; 90 installed packages. The only lockfile
install-script marker is optional macOS fsevents; no unexpected Windows installer
script. npm audit returned zero known vulnerabilities (including dev packages),
not a general guarantee of supply-chain safety.

Tests exercise real provider adapters/normalizers, page entry points, mocked
extension storage/channel, delayed runners and actual Vite output. Synthetic
network responses cannot validate remote schemas, current key issuance, browser
CORS, Cloudflare, native Web Locks scheduling or rendered geometry. No coverage
percentage is used as a release argument.

## 10. Manual tests still required

1. Load final dist in normal Chromium; no extension errors. Search `cap` with
   Printables enabled. Confirm Searching, actual cards, covers and original link.
   Prior user evidence exists; repeat for the final changed artifact.
2. Obtain own free keys using [official setup instructions](supported-repositories.md).
   Save each in Settings; no reinstall. Submit a new explicit search and confirm
   all four independent Searching → cards. Check missing-key Configure/direct
   links, bad-key isolated failure, blank Replace, Remove → setup-required.
3. For each aggregated provider search a broad term; load pages 1, 2 and 3.
   Verify >20 distinct cards, increasing page/offset in Network, unchanged first
   batch, deduplication, bounded one-page-per-click and independent exhaustion.
   Specifically confirm Cults offset query is accepted; do not share auth traces.
4. While Load more is pending submit a different query; no old cards/statuses or
   cursor enter it. Slow/block one provider; others remain usable. Verify 429
   cooldown without automated repeated requests.
5. Use two Settings/Results tabs: race history collection with Clear; change
   distinct repository toggles concurrently; confirm no resurrection/lost edit.
   Repeat with legacy preferences/history before first migration. This checks
   native [same-origin Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), not just the test shim.
6. Tab through popup, Results, Load more, Settings credentials and history. Check
   visible focus, meaningful status text, narrow window, system/light/dark and
   theme reload/device changes. No connected browser was available to this audit.
7. After fixing expansion, run the six representative EN/DE phrases with disabled,
   unconfigured and direct-only sources. Observe original plus ≤3 unique local
   variants only for searchable sources, deduped cards and bounded paging.

## 11. Legitimate V1 limitations

Chromium-first; undocumented Printables schema may change; provider terms/key
issuance/quotas are external dependencies. Two native-only sources. Metadata can
be absent; no universal relevance/currency conversion; loaded-data filtering.
User-driven paging only. Worker fetch may finish after caller cancellation.
Local storage is not encrypted; browser history is separate from app history;
repository-provided images create ordinary image requests. None excuses missing
required expansion or unverified live continuation.

## 12. V2 backlog

Firefox, arbitrary added sources, broader language coverage beyond required modest
EN/DE, additional repositories, richer metadata and ranking. A dynamic declarative
registry only if separately justified, with real validation/fallback tests. No
backend, paid API dependency or remote executable logic is proposed.

## 13. Files changed

| File | Reason |
| --- | --- |
| `README.md` | Current live evidence, privacy link and explicit release blockers |
| `PRIVACY.md` (new) | Complete destination/data/storage inventory and exceptions |
| `docs/release-audit.md` (new) | Findings, evidence, verdict and required acceptance |
| `docs/live-provider-enablement.md` | Current Printables cover checkpoint |
| `docs/provider-architecture-review.md` | Mark staged review as historical |
| `docs/provider-classification.md` | Distinguish historical all-fallback classification |
| `docs/provider-cults3d.md` | Point historical evidence to current support |
| `docs/provider-printables.md` | User-confirmed thumbnails; preserve remaining limits |
| `docs/settings.md` | Cross-page lock behavior, missing expansion and privacy |
| `docs/supported-repositories.md` | Current user-confirmed Printables support |
| `public/manifest.json` | Accurate application description only |
| `src/popup/main.ts` | Anonymous readiness separated from credential count |
| `src/providers/availability.ts` | Correct Printables evidence description |
| `src/providers/cults3d.ts` | Explicit no-referrer policy |
| `src/providers/printables.ts` | Update comments only; query unchanged |
| `src/results/index.html` | Loaded-card filter explanation and current provider notice |
| `src/results/view.ts` | Actionable all-disabled empty state |
| `src/search/query.ts` | Unicode repair and safe truncation |
| `src/shared/preferences.ts` | Cross-page update/migration locks |
| `tests/background-build.test.ts` | Production GPL/source-notice regression |
| `tests/credential-audit.test.ts` | Uniform explicit no-referrer assertions |
| `tests/printables.test.ts` | Current evidence wording assertions |
| `tests/release-audit.test.ts` (new) | Five query and actual page-entry regressions |
| `tests/storage-concurrency.test.ts` (new) | Four cross-page/migration race regressions |
| `vite.config.ts` | Package LICENSE and source/distribution notice |

No dependency, lockfile or provider protocol changes.

## 14. Final recommendation

**DO NOT SHIP V1.** Complete the modest promised local Expanded Search behavior,
resolve the MMF credential-policy contradiction, establish live continuation for
every aggregated provider, complete native browser acceptance, then rerun the
locked clean validation and inspect the exact release artifact. Publish complete
corresponding source for that artifact (including modifications) with GPL notices;
a generic repository link alone does not establish exact source correspondence.
