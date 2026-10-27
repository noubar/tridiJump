# Cults3D integration

**Current production status:** direct-search fallback only. Under the
[provider access policy](provider-policy.md), free API access must be confirmed
before enabling aggregation or asking users for keys. The public documentation
did not explicitly confirm API pricing. The adapter and tests below are retained
for that verification; production neither collects credentials nor requests API
host permissions. No HTML scraping has been substituted.

The updated V1 policy explicitly supports free user API keys and requires local
extension storage and provider-specific Settings when that feature is implemented.
The current lack of credential UI/storage is unfinished staged work, not a
tab-memory-only product decision. Prompt 08 adds no Cults implementation or
credential framework; see the [architecture review](provider-architecture-review.md)
for the required configuration declaration, Setup required state, and follow-up tests.

Implemented 2026-10-27. Cults3D is ranked first in the
[provider investigation](provider-investigation.md). This implementation follows
recommendation A (official API) for the disabled adapter, and recommendation E
(user-opened search) for the current production path. The `Provider` interface and
search orchestrator are unchanged. No other live provider is implemented.

## Mechanism

`src/providers/cults3d.ts` owns the endpoint, GraphQL query, authorization,
response validation, normalization, rate-limit handling, and fallback URL.
The UI consumes only normalized `ModelResult[]` and existing search states.

It makes one POST to `https://cults3d.com/graphql` for each nonblank submitted
query. A GraphQL variable carries the query; it is never interpolated into
executable GraphQL. The search requests at most 20 results through
`creationsSearchBatch`. It does not paginate, retry automatically, introspect
private data, fetch model files, scrape HTML, or execute remote code.

The official documentation describes nickname/API-key HTTP Basic authorization.
Read-only keys are documented in the site's August 2025 API updates. The adapter
accepts authorized credentials supplied by its caller; no password or operator
secret is bundled or persisted. When enabled, it sends credentials only to the
fixed HTTPS API origin, rejects redirects, and omits browser cookies. The current
production UI does not collect credentials pending free-access verification.
[Official API guide](https://cults3d.com/en/pages/graphql),
[official feature log](https://cults3d.com/en/pages/logbook-updates-new-features-cults)

The current manifest grants no API hosts. A future enabled Cults adapter would
need only `https://cults3d.com/*` for cross-origin requests from the results page.
Local credential configuration will also require the extension storage permission
when implemented. No cookies, scripting, background worker, or broad tabs
permission is implied by that requirement.

## Normalization and errors

Names and HTTPS Cults model URLs are required; unusable records are skipped.
If a nonempty batch contains no usable records, the adapter reports failure,
not an empty successful search. Empty valid batches return `[]`.

The adapter requests English names/URLs, illustration URLs, creator nicknames,
EUR price cents, download counts, and like counts. EUR cents become major units
by dividing by 100. A reported zero price means free; absent/invalid price stays
unknown. Likes map to provider-specific `popularity`, not a star rating or a
cross-source relevance score. Query provenance is recorded. Missing or malformed
optional metadata is omitted. Formats, star ratings, and creation dates remain
unset; a publication date is not silently relabeled as creation.
[Officially linked API examples](https://gist.github.com/sunny/07db54478ac030bd277c19cfe734648b)

HTTP/network errors, unreadable responses, malformed envelopes, and GraphQL
errors (including partial errors) fail only this provider. Server messages and
bodies are not forwarded to the UI, avoiding accidental credential echoes.
On HTTP 429, or a reported remaining quota of zero, further searches wait until
`Retry-After`/`x-ratelimit-reset`; without a usable reset the local policy is a
one-minute cooldown. This is not a claim about Cults' quota. No automatic retry
loop is introduced.

The supplied `AbortSignal` reaches `fetch`. Cancellation is checked before the
request, after headers, and after JSON parsing. The existing orchestrator owns
the 10-second default timeout, cancellation on new searches, and stale-response
protection. An abort is not converted to empty results.

The separate fallback uses `URLSearchParams` to build
`https://cults3d.com/en/search?q=…`. It opens on user action, independently of API
requests. It does not report an outbound tab as a successful model search and
does not automate any access challenge.

## Verification and fixtures

`tests/fixtures/cults3d/search.json` is explicitly **synthetic**, based on documented
field shapes. It contains no captured creator assets, secrets, or actual model
records. A fixture README describes provenance. No authenticated production
response was available to capture. The tests cover normalization, empty results,
invalid required/optional fields, server and network errors, rate limits, and
cancellation. The real production results-page entry is tested to make no API
requests, collect no keys, and safely encode the direct-search fallback.

Development checks on 2026-10-27:

- Tests, strict type checking, and production build passed.
- The generated extension contains no demo provider code, synthetic models,
  example.com model links, test credentials, or demo thumbnail assets.
- A real unauthenticated API POST returned HTTP 401. No credentials were sent.
- An ordinary request to the fallback search page returned HTTP 403. No challenge
  was executed or bypassed. Browser navigation may behave differently; this is
  not proof that the fallback is unusable for a normal user.
- No browser was connected for manual extension UI verification, and no authorized
  API key was available. **Successful authenticated search and production schema
  compatibility remain unverified.** Passing synthetic tests is not evidence
  that live authenticated search works.

## Manual development checklist

1. Run `npm run dev`, load `dist/` unpacked in Chromium, and open the popup.
2. Submit `benchy`. Confirm there are no demo cards or API requests, the direct-
   search-only notice is visible, and the Cults link contains the encoded query.
3. Before connecting the adapter, verify that API access/key issuance is free
   using first-party evidence and an authorized account. Do not assume that free
   marketplace registration proves free API access.
4. In the staged implementation, add the required local-storage Settings and
   Setup required behavior, then connect the adapter. Test with official-document
   fixtures/mocks if an authorized key is unavailable. With authorized access,
   verify current schema, cards, prices, filters, cancellation, and local Save/Clear.
   Never add scraping to hide GraphQL validation or access failures.
5. Verify the manual fallback in a normal browser. If a challenge or access
   denial appears, stop; no bypass is part of this integration.

Do not claim verified live compatibility until authenticated checks are completed.
Development without a key may proceed against docs/fixtures once the eligibility
requirements are verified; clearly mark live authenticated testing pending.
Do not paste real keys into chat, fixtures,
test assertions, screenshots, or version control.

## What could break

GraphQL field names/nullability, search arguments, credential policy, rate-limit
headers, locale/currency handling, image hosts, fallback routing, or service
terms can change. The adapter uses the officially documented field names but
has not verified their current combined selection against an authenticated
schema. Schema errors intentionally surface as provider failure rather than
silently dropping required fields. No price, file-format, creation-date, or
universal rating assumptions should be added to hide missing metadata.

API use is intended for metadata display and linking back; model files remain
on Cults. Respect current terms, key permissions, image-display rights, and rate
limits. tridiJump's GPL license does not relicense creator content.
[Official API overview](https://cults3d.com/en/api)
