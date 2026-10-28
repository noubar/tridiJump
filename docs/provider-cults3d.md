# Cults3D integration

Historical staged investigation/review: current implementation and release status
are recorded in [the final audit](release-audit.md) and
[supported repositories](supported-repositories.md). Earlier verification limits
below are dated evidence, not current all-provider support claims.

**Current production status (2026-10-28):** connected to the results page with
local user nickname/key configuration. Missing credentials produce Setup required;
configured searches call the official endpoint. Authenticated live verification
and current free key issuance remain pending. See the
[live enablement review](live-provider-enablement.md) for evidence, all six
providers, and exact configuration/manual acceptance steps.

Official documentation was rechecked on 2026-10-27. The guide still documents
nickname/API-key Basic auth and dynamic quotas; officially linked examples
still demonstrate the implemented search and metadata fields. Direct retrieval
of Cults documentation returned 403; indexed first-party text was available.
No challenge was executed or bypassed. No incompatible change was established,
but authenticated schema compatibility remains unverified.

**API pricing remains unconfirmed by explicit first-party text.** This is not
evidence of paid access. The latest task explicitly requests documented user-key
paths with fixture-based implementation when development keys are absent. This
path is now connected, with use limited to the user's own free API access under
the [permanent policy](provider-policy.md). There was no account/key to verify
issuance or billing. **Live authenticated testing remains pending.**

Implemented 2026-10-27. Cults3D is ranked first in the
[provider investigation](provider-investigation.md). This implementation follows
recommendation A (official API), with E (user-opened search) as fallback. These historical mechanism letters
are distinct from current A–D product classifications. The
`search(query, signal?): Promise<ModelResult[]>` signature is unchanged. The
credential follow-up adds only optional field declarations and generic setup handling.

## Local configuration boundary

`Provider.credentialFields` declares names, labels and secret flags, never values.
Shared helpers in `src/providers/credentials.ts` load/save/clear/check status using
provider-keyed extension `storage.local` only (Chromium `chrome.storage.local`).
They accept only declared, nonblank string fields. No sync storage, page
`localStorage`, history, registry data, logs, exports or remote store is used.
Storage errors become fixed messages without the original error contents.

The reusable Settings form supplies nickname/key fields, Save, Remove, and configured status. Saved
values are never prefilled; inputs clear on submission. Failed replacement leaves
the previous saved key intact. Local removal does not revoke the key at Cults.
This application storage is not encrypted by tridiJump or an OS credential vault.
Production now exposes the fields and Save/Remove actions. The official
key-management route is `https://cults3d.com/en/api/keys`; prefer a read-only key.
Stored status certifies local presence, not remote validity or current pricing.

The adapter reads only its own credentials before network dispatch and checks
abort again after that asynchronous read. It caches no credentials between
searches. Missing fields signal `SetupRequired`, a generic condition mapped by
core to non-error `setup-required`, with no request and no effect on other sources.
Invalid supplied keys can still fail. The condition contains no credential values.

The earlier review suggested preflight before invoking `search`. This follow-up
resolves credentials inside the provider before network dispatch instead, avoiding
duplicate reads and a mutable credential cache while protecting direct callers.
The core recognizes only the generic setup condition, with no repository-specific
authentication branch or payload. Settings routing uses provider identity.

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
secret is bundled. Credentials are persisted only in extension local storage.
Requests send credentials only to the fixed HTTPS API origin, reject redirects,
omit browser cookies and disable request caching.
[Official API guide](https://cults3d.com/en/pages/graphql),
[official feature log](https://cults3d.com/en/pages/logbook-updates-new-features-cults)

This adapter needs only `https://cults3d.com/*` and `storage`. The manifest also
grants the precise origins of the other two implemented user-key APIs, never
staging or wildcard hosts. No cookies, scripting, background worker or broad tabs
permission is requested. A host grant does not override authentication or quotas.

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
cancellation. The real production entry is tested without credentials (Setup
required, no request) and with fake local credentials (actual adapter and
orchestration, mocked HTTP, normalized model cards). Native fallback remains
available in both cases. Additional tests cover local save/replace/remove,
provider separation, malformed storage, no secret prefill, sanitized storage
errors, and cancellation/new search/timeout during a delayed storage read.
HTTP 401/403 errors containing echoed fake credentials/Basic headers are replaced
by useful fixed messages and fail only Cults. Clicking Remove Credentials then
running the adapter again produces Setup required without a second request.

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
2. Submit `cap` without credentials. Expect Setup required, no API request, a
   Settings route, and the encoded Cults fallback link.
3. Create your own free read-only key via the official key-management page.
   Save nickname/key in Settings; reloading Settings must show blank fields and
   configured status. Do not pay for API access if the onboarding conditions changed.
4. Submit `cap` again: expect searching, then actual cards on success. Verify
   original model links, prices and cancellation. Remove local credentials and
   submit again: expect Setup required without another request. Live authenticated
   verification remains pending. Never scrape to hide validation/access failures.
5. Verify the manual fallback in a normal browser. If a challenge or access
   denial appears, stop; no bypass is part of this integration.

Do not claim verified live compatibility until authenticated checks are completed.
Development without a key proceeds against docs/fixtures; live authenticated
testing and explicit pricing confirmation remain pending.
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
