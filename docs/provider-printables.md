# Printables GraphQL candidate integration

Updated 2026-10-28. **Implementation: connected anonymous candidate. Live Chromium
verification: PENDING.** This supersedes the earlier direct-search-only disposition.
An HTTP refusal from Codex does not prove that a locally installed extension
will be refused. Conversely, fixtures do not prove that it will succeed.

## Chromium CORS finding and targeted transport change

The user tested the Results-page fetch in real Chromium with `cap`. DevTools
showed an OPTIONS preflight to `https://api.printables.com/graphql/` returning
HTTP 200, followed by a CORS error: the preflight response lacked
`Access-Control-Allow-Origin` for `chrome-extension://<extension-id>`. The POST
was reported as `net::ERR_FAILED`. This proves the page-context transport failed;
it does **not** prove an actual GraphQL-operation HTTP 403, schema error or need
for authentication. The GraphQL query has not been changed in response to CORS.

This finding motivated moving only Printables HTTP transport to a packaged MV3
module service worker. Whether that worker receives valid search data remains
**PENDING**. No subsequent live worker request or successful real card retrieval
is claimed by the automated tests.

## Evidence and implementation boundary

The [original first-party investigation](provider-investigation.md#printables)
records an anonymous HTTP 200 from `POST https://api.printables.com/graphql/`,
using `searchPrints2(query, limit: 1, offset: 0)`, with `items` and `totalCount`.
It records ID/name/slug, likes/downloads, average rating and publication date.
The successful raw response and full original request were not saved. This is
historical protocol evidence, not a current frontend trace or public API promise.

Current indexed first-party model pages, for example
[Cap Holder](https://www.printables.com/model/587926-cap-holder), confirm the
`https://www.printables.com/model/<id>-<slug>` path form. That supports URL
construction; it does not verify a current search-to-detail match in Chromium.
No third-party adapter, GraphQL query implementation, image-path convention or
ordering enum was copied or adopted from search hits.

The candidate deliberately uses only that recorded minimal search structure.
No unobserved thumbnail/creator fields, image CDN templates, GraphQL enum names,
filter arguments or authentication mechanisms are guessed. Current full-schema
verification remains pending. This is an undocumented/unsupported frontend
interface and may change without notice; it is not an official developer API.
The packaged registry's classification A means no user credentials, not official
API support or successful live verification.

## Actual extension request

`src/providers/printables.ts` retains the existing `Provider.search()` and
`searchPage()` interface, normalization and pagination. It sends only
`{ type: 'printables.search', query, limit: 20, offset }` through
`chrome.runtime.sendMessage`; it no longer calls fetch. There is no page-fetch
fallback if the worker/message channel is missing; the safe error asks for an
extension reload or native search.

`src/background.ts` synchronously registers the single-purpose handler in
`src/providers/printables-background.ts`. Only a sender with this extension's
runtime ID and exact Results-page protocol/host/path is accepted. Query must be
a nonempty normalized string of at most 200 characters; limit must be an integer
1–20; offset must be an integer 0–2147483647. Message type and exact field names
are checked. Unknown types, extra URL/origin/hostname/method/header/Authorization
fields, and all other inputs are rejected without a network request. No external
message listener, arbitrary URL forwarding or remote registry dispatch exists.

The worker owns the fixed endpoint, unchanged GraphQL construction and anonymous
fetch. It normalizes the response before returning `{ ok: true, page }`. Errors
cross the channel only as `{ ok: false, error: { kind, status? } }`: network,
HTTP, GraphQL, invalid JSON/shape, invalid input or rate limit. No Response object,
HTML body, remote error text, headers or credential values cross the boundary.
The client maps these categories to bundled messages and validates reply shape.

A search for `cap` initially sends this anonymous JSON POST:

```json
{"query":"query { searchPrints2(query: \"cap\", limit: 20, offset: 0) { totalCount items { id name slug likesCount downloadCount } } }"}
```

The string value is encoded using `JSON.stringify`, so user text cannot become
GraphQL syntax. No undocumented variable type names or ordering values are
needed. Only `Accept: application/json` and `Content-Type: application/json`
are added. Fetch uses `credentials: omit`, `redirect: error`, `cache: no-store`,
`referrerPolicy: no-referrer`. No cookies, tokens,
Authorization, special Origin/Referer headers or browser impersonation are used.
There is no background crawler, model-file download or automatic endpoint retry.

[Chrome's worker documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics)
specifies packaged module-worker registration; the generated manifest declares
`background: { service_worker: 'background.js', type: 'module' }`. Vite emits
that stable entry filename and its local static imports. The handler returns
literal `true` for asynchronous replies, following
[Chrome's messaging guidance](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
The existing `https://api.printables.com/*` host grant is unchanged. No extra
permission, proxy, content script, security disabling or `no-cors` mode is used.
Server authentication, access controls and usage restrictions still apply.

## Normalized fields and unknowns

| ModelResult | Candidate mapping / remaining verification |
| --- | --- |
| `providerId` | Fixed `printables` |
| `id` | Positive decimal ID, normalized to string |
| `title` | Trimmed nonempty `name`; rendered as text |
| `url` | Fixed Printables origin plus validated ID and slug |
| `query` | Exact normalized query that produced the result, including a supplied variant |
| `downloads` | Nonnegative integer `downloadCount`, when present |
| `popularity` | Nonnegative integer `likesCount`, source-local only |
| Thumbnail, creator | Not mapped: current search field selections/URL forms unverified; cards show the existing No preview placeholder |
| Free/paid, amount/currency | Unknown. Missing price does not imply Free; no all-free capability declared |
| Rating | Omitted: historical numeric-string `ratingAvg` exists, but its scale has not been verified |
| Creation date | Omitted: historical `datePublished` is not proof of creation time |
| Formats, license/model type | Current search schema/semantics unverified; no file or detail requests |

Prusa's [Clubs documentation](https://help.prusa3d.com/article/about_493458)
describes public and supporter-exclusive models. It does not establish that all
search hits are free. Free/Paid filters therefore exclude unknown Printables
prices, with the existing UI explaining unknown-price counts.

Default provider ordering is preserved; no native order/filter parameter is sent.
Current native ordering values and their semantics remain unverified. Existing
sorts/filters operate only on loaded normalized data, with no invented global
relevance or unavailable-value substitution. Latest/rating/price cannot operate
on this candidate's unknown fields; existing availability rules apply.

## Pagination, isolation and security

Initial batch size is 20. Continuation uses the previous offset plus the raw
returned item count, including records skipped by normalization. A validated
nonnegative integer `totalCount` is required. An empty batch or an offset reaching
the total exhausts the stream. Missing/malformed totals fail visibly rather than
being treated as a successful empty search or guessed continuation. No next URL
from remote data is fetched. Continuations use the existing numeric cursor guard.

Each Load more action requests at most one further page per eligible provider.
Expanded query inputs are capped/deduplicated by the existing orchestrator to
original plus three variants. Variant initial pages run sequentially per provider;
continuations remain user-driven and round-robin across active query streams.
Duplicate model IDs/URLs are suppressed by the existing search runner. The actual
synonym-expansion engine remains absent; the UI toggle alone creates no variants.

Network errors, 401/403, GraphQL errors, invalid JSON and unusable response shapes
produce a Printables-only failure with native fallback retained. They do not
become Setup required or zero-result success. Remote errors/body text are never
included in user-facing errors or logs. HTTP 429 applies Retry-After backoff
without automatic retries. Backoff now belongs to the worker handler, shared
across Results tabs for that worker lifetime.

Cancellation remains caller-side: an already-aborted signal sends no message;
later abort immediately rejects the provider promise with AbortError and removes
its listener. The cancelled promise ignores late success/error replies, and the
unchanged orchestrator also guards run identity and page continuations. A worker
network request already dispatched **may finish**; no request-ID cancellation
protocol or claim of network-level abort is added. Closing/reloading a tab may
also close its channel. Timeouts still isolate that provider; stale results from
old queries/pages never enter the new grid. Worker termination/channel failures
surface as a sanitized transport error. There is no automatic retry.

No Printables credential fields exist. The adapter never imports/reads credential
storage. No stored Thingiverse, MyMiniFactory or Cults3D credential can be attached
by its code path. Registry-style metadata cannot change the bundled endpoint.
Model origins are fixed, slugs/IDs constrained, and titles rendered through the
existing textContent-based cards. No remote HTML/JavaScript is executed/injected.
Settings now checks optional credentialFields rather than assuming every
searchable provider needs configuration; no credential framework was added.

## Access observations and restrictions (not browser verdicts)

Earlier ordinary anonymous requests from Codex found:

| Route | Observation |
| --- | --- |
| HTML search `https://www.printables.com/search/models?q=cap` | HTTP 403 challenge page |
| GraphQL POST, one-item search with ID/name/slug selection | HTTP 403 |
| `https://www.printables.com/robots.txt` | HTTP 403; current guidance not retrieved |

A subsequent attempt before the user's clarification again got GraphQL HTTP 403
with JSON content type and frontend HTTP 403 with a challenge page. No response
models were obtained. The initial sandbox socket error 10013 was local; actual
HTTP statuses were obtained only after authorized network execution. Web-tool
inaccessibility also is not a server-status measurement. No further protected
requests were made after the clarification; no bypass was attempted.

During the earlier investigation, browser discovery returned no connected browser.
The subsequent user-run Chromium test established the page CORS finding recorded
above. Successful GraphQL-operation data and worker transport remain unverified.
No successful live search populated Printables cards during this development run.

[Prusa general terms](https://www.prusa3d.com/page/general-terms-and-conditions-of-use-of-the-prusa-websites_231226/)
9.1, 9.3 and 9.5 address unauthorized extraction, unreasonable technical burden
and content reuse. The [Printables terms](https://www.prusa3d.com/page/terms-of-service-of-printables-com_231249/)
incorporate them and describe user-content licensing. An undocumented endpoint's
existence is not an unrestricted redisplay license or negotiated integration
permission. This task does not claim blanket approval from Prusa. These usage
conditions remain relevant to release review, separately from technical testing.

## Automated checks and real-browser acceptance

The fixture is original synthetic data based on the recorded response shape,
not a sanitized live capture. Automated tests do not contact Printables. They
cover anonymous request construction and storage isolation, parser/URL safety,
missing metadata, malformed/GraphQL/HTTP errors, pagination/raw counts/totals,
rate limits, abort, stale suppression, variant bounds/deduplication, timeout and
provider failure isolation. Production Settings and Results entry tests verify
no credential form, enabled/disabled handling, Searching, safe clickable cards,
progressive insertion and Load more; three real authenticated adapters remain
independent under mocked HTTP.

**Real-browser acceptance remains PENDING:**

1. Run `npm run build`, then reload the unpacked `dist/` extension in Chromium.
   Confirm its background service worker is registered and refresh Results pages.
2. Enable Printables in Settings; no Printables credential configuration exists.
3. Search `cap`, inspect Printables status, with All prices selected. Expect Searching, then actual cards if
   this anonymous interface is accepted. Missing previews/prices are expected.
4. Open several cards and compare IDs/titles/destinations with native search.
5. Click Load more and confirm **more than 20 distinct Printables models**.
6. Start another search while Printables is loading (also during Load more);
   verify neither old-query models nor old continuations appear in the new grid.
7. Confirm configured Thingiverse, MyMiniFactory and Cults3D still work, including
   when Printables fails. Native Printables search must remain usable separately.
8. If the worker is denied/challenged (including HTTP 403), **stop** and retain fallback; do not borrow sessions, solve
   challenges, change identity headers or otherwise defeat provider controls.

For GraphQL/schema errors, report only the sanitized category and inspect the
ordinary logged-out frontend Network operation using the guidance below. Mark
the transport **LIVE VERIFIED** only after this manual acceptance succeeds.

If the candidate query fails because the current schema differs, the required
next evidence is a **sanitized ordinary, logged-out browser Network trace**:

- Exact GraphQL operation text and variables for `cap`, response envelope and
  two representative result records. Include the subsequent user-requested
  page's operation/variables and total/continuation fields.
- The corresponding native model URLs, title and thumbnail URL, so ID/slug/image
  mapping can be checked against actual frontend output.
- If available in those same search responses: creator fields, rating scale,
  explicit price/access status, date meaning, license/formats/model type.
- For proposed native sorts/filters: request differences after one ordinary
  control change, showing actual enum/filter names and semantics.
- Status/content type from an extension Results request, distinguishing schema
  errors from host-permission errors and server refusals.

Share only query/variables and sanitized public response data, not a raw HAR or
Copy-as-cURL export containing cookies, Authorization, browser/session tokens,
account identifiers or other secrets. No credentials or access-control bypass
are needed or requested. Unknown optional fields will stay omitted until verified.

## Final change and check record

Created `src/providers/printables.ts`, `tests/printables.test.ts` and
`tests/fixtures/printables/search.json`. Updated provider composition, the precise
manifest grant, Results notice, anonymous-provider handling in Settings, README,
these integration notes, live enablement/Settings documentation and fixture
provenance. Existing credential-only test matrices now explicitly select the B
providers; their production-page scenarios explicitly disable the unrelated
anonymous source. New production-page tests exercise Printables enabled.
The provider interface, normalized model and orchestrator are unchanged.

Previous candidate-stage commands: `npm test` (**254 passed, 20 files**, including 22 new Printables
tests), `npm run typecheck` (passed), `npm run build` (passed), and
`git diff --check` (passed; line-ending notices only). Generated manifest and
all three entry-page asset references were inspected. The bundled Printables
endpoint is present, with no fake keys, fixture IDs/titles or test error strings.
No dependencies were introduced. Real Chromium cards, image/creator fields,
current native ordering/filter values and live pagination remain pending as
described above; mocks are not live acceptance evidence.

### Targeted Chromium transport follow-up

Added `src/background.ts`, `src/providers/printables-background.ts` and
`src/providers/printables-messages.ts`; changed only the Printables client,
manifest registration and Vite worker entry/output wiring. Other provider
transports, the provider contract, Results rendering and the search orchestrator
were not changed by this follow-up. Documentation records the user's CORS
observation separately from still-pending GraphQL execution.

Added worker-boundary, real worker-entry registration, JSON messaging and
in-memory production-build tests; updated the Printables pipeline tests to use
the real handler through a mocked Chrome channel. Coverage includes rejected
message types/extra fields/invalid query-limit-offset/senders, fixed anonymous
requests, safe result/error replies, missing channel handling, immediate caller
abort, old query/page suppression, and HTTP/GraphQL failure isolation alongside
the three authenticated adapters. The production-build test checks the stable
worker entry and all reachable local static modules without writing build files.

Final follow-up commands: `npm test` (**303 passed across 22 files**),
`npm run typecheck`, `npm run build`, and `git diff --check` all passed (Git
reported only line-ending notices). Generated `dist/manifest.json`,
`dist/background.js`, its static imports and page asset references were inspected.
The Printables HTTP endpoint appears only in the worker transport bundle;
precise API grants and `storage` are unchanged. No new dependencies, proxy,
credential use, content scripts or unrelated styling/features were added.
Live worker search, clickable real cards and >20 distinct models still require
the manual checklist above before any **LIVE VERIFIED** designation.
