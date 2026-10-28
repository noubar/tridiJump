# Live provider enablement review

Reviewed **2026-10-28**. This is the current implementation and evidence record;
it supersedes the all-fallback release disposition in the earlier classification.
No synonyms or later roadmap features are included.

For the user-facing **Works immediately / Requires free provider setup /
Direct-search fallback** categories and official credential instructions, see
[supported repositories and provider credentials](supported-repositories.md).
This investigation retains the detailed evidence and historical verification limits.

**Printables follow-up:** the [undocumented GraphQL integration](provider-printables.md) is now
connected anonymously, based on the historical first-party schema observation.
The user live verified basic worker search, real cards and a tested model link
on **2026-10-28**. The user has also confirmed working cover images;
full live pagination/exhaustion and other optional mappings are not claimed verified.
The original three authenticated integrations and their evidence below are unchanged.
The user's Chromium test subsequently found page-context CORS failure after a
200 preflight lacking Access-Control-Allow-Origin. Printables transport now uses
the packaged MV3 worker. The subsequent successful basic search checkpoint is
distinct from still-pending optional-field and full pagination verification.

## Outcome and limits

The results page now dispatches **Cults3D, MyMiniFactory and Thingiverse** adapters.
Each loads its own local credentials, constructs a real request to its official
API, normalizes the response, and feeds the existing orchestrator and grid.
Missing credentials produce **Setup required**, not a failure. All six native
search links remain available. MakerWorld and Thangs are fallback-only. Printables
now has an anonymous adapter; its current behavior/limits are documented separately.

**No authenticated live model search was completed here.** No authorized key or
connected browser was available. Successful authenticated responses, current key
issuance and billing conditions therefore cannot be conclusively verified here.
Tests exercise the actual production entries/adapters with synthetic HTTP, not a
live repository. This does not satisfy the live manual acceptance test by itself.

The official APIs are not classified as technically impossible merely because
their onboarding pages are blocked in this environment. Conversely, absence of
a stated fee is **not proof of free access**. The B labels in application metadata
identify the implemented user-key paths; free ordinary-user issuance remains an
explicit verification item below. Use only keys obtained without paid API access.
tridiJump never enrolls users in billing or requires a paid API subscription.
If a provider requires payment for the key/API, do not pay for V1; use native search.

## Per-provider findings

### Cults3D — official user-key API, implemented

1. **Actual results:** the documented search returns model metadata. The production
   path is connected; authenticated live success remains pending your key.
2. **Mechanism:** bounded GraphQL search, no scraping or file downloads.
3. **Credentials:** your Cults nickname and an API key, preferably read-only.
4. **Free issuance:** no API fee/tier is described in the public guide. Current
   issuance without payment was not verified with an account; do not confuse free
   marketplace registration with a pricing guarantee.
5. **Official acquisition:** sign in at [API keys](https://cults3d.com/en/api/keys),
   create a separate read-only key; follow the key link in the
   [official guide](https://cults3d.com/en/pages/graphql) if the route changes.
6. **Request:** `POST https://cults3d.com/graphql`, JSON query/variables,
   `creationsSearchBatch(query: $query, limit: 20)`.
7. **Authentication:** HTTP Basic nickname/key in Authorization, never a password.
8. **Normalized fields:** title, original URL, thumbnail, creator, EUR price from
   cents, explicit zero-price free status, downloads, likes as provider-local
   popularity, query provenance. Unavailable formats/dates/ratings are omitted.
9. **Restrictions:** the [official overview](https://cults3d.com/en/api) expressly
   describes external metadata display with links back; files stay on Cults.
   Dynamic quotas must be respected. No documented prohibition on this read-only
   metadata/link-back use was found; that is not a separately negotiated agreement.

**Observed:** an unauthenticated search POST returned **401, HTTP Basic: Access
denied**. This confirms the auth boundary, not successful model retrieval. Guide
and key-page GET requests returned a challenge (403); indexed first-party guide
text remained available. No challenge was automated or bypassed.

### MyMiniFactory — official user-key API, implemented

1. **Actual results:** the official v2 schema defines authenticated object search.
   Production is connected; authenticated success remains pending your API key.
2. **Mechanism:** official REST JSON search, one first page of 20 records.
3. **Credentials:** application API key, not an OAuth client ID/secret or session cookie.
4. **Free issuance:** the official README describes account-created API clients;
   it does not state a price. No paid API tier was established, but current free
   key issuance for an ordinary account was not independently completed here.
5. **Official acquisition:** sign in, open
   [Settings → Developer](https://www.myminifactory.com/settings/developer), create
   an application, copy its **API key**. The
   [official README](https://github.com/MyMiniFactory/api-documentation/blob/master/README.md)
   directs users to account settings and the
   [developer page](https://www.myminifactory.com/pages/for-developers).
6. **Request:** `GET https://www.myminifactory.com/api/v2/search` with `q`,
   `page=1`, `per_page=20`, and the documented authentication parameter `key`.
7. **Authentication:** query-key auth is explicitly specified in the
   [official OpenAPI](https://github.com/MyMiniFactory/api-documentation/blob/master/myminifactory-api.yaml).
   This uses the policy's narrow URL exception **only for the provider request**.
   No redirect, referrer, browser history entry, native link, log or error includes it.
8. **Normalized fields:** title, original URL, ID, designer username, thumbnail,
   likes/popularity and actual returned file extensions. No undocumented price,
   free status, downloads or rating is invented; publication is not relabeled creation.
9. **Restrictions:** API-key search is documented separately from user OAuth/file
   access. No model files, paid-user content or user sessions are requested.
   The [terms page](https://www.myminifactory.com/pages/terms-and-conditions) was
   blocked here; no definitive current metasearch prohibition or unrestricted
   redisplay license was established. Respect content rights and current API terms.

**Observed:** keyless `GET /api/v2/search?q=cap&page=1&per_page=1` returned **401**
JSON with `Authentication required`. Developer/terms pages returned 403 and were
not bypassed. An authentication requirement is not itself an aggregation ban.

### Thingiverse — developer App Token API, implemented; compatibility pending

1. **Actual results:** the developer API supports search; the production path is
   connected. Successful current App Token use must be checked with your token.
2. **Mechanism:** developer REST search, a bounded first page. It deliberately
   does not obtain the website's view JWT, session cookie or password.
3. **Credentials:** your application's **App Token**.
4. **Free issuance:** free developer access is historically described in
   [Adafruit's firsthand Thingiverse setup tutorial](https://learn.adafruit.com/pyportal-thingiverse-viewer?view=all).
   Current enrollment could not be completed here; current first-party pricing
   text was unavailable. Marketplace memberships do not establish API pricing.
5. **Official acquisition:** sign in at
   [My Apps](https://www.thingiverse.com/developers/my-apps), create an application,
   open its details and copy **App Token**, not client secret. The
   [official getting-started guide](https://www.thingiverse.com/developers/getting-started)
   is linked in Settings. Do not copy a website session token from developer tools.
6. **Request:** `GET https://api.thingiverse.com/search/{encoded-query}` with
   `page=1&per_page=20`, using the developer REST contract.
7. **Authentication:** `Authorization: Bearer <App Token>`. No token in the URL.
8. **Normalized fields:** `hits` → title, original `public_url`, ID, thumbnail,
   creator, valid creation timestamp, likes and downloads when actually present.
   Unknown price/free/formats/rating stay unknown.
9. **Restrictions/compatibility:** [official API reference](https://www.thingiverse.com/developers/rest-api-reference)
   and [API terms](https://www.thingiverse.com/legal/api) were unavailable (403).
   Current [first-party v2 Swagger](https://api-staging.thingiverse.com/v2/doc)
   names the production origin and documents `/v2/search/things?term=…`, a hits
   envelope, shared model fields and JWT Bearer auth. It also explicitly references
   legacy v1 download metadata. That does **not** prove old App Tokens are v2 JWTs.
   This adapter uses the developer App Token route, not guessed JWT compatibility
   or an automatic switch to website authentication. If legacy access is retired
   or your token is denied, the useful failure/native fallback remains visible.

**Observed:** ordinary keyless production requests to v1 and v2 returned **403
HTML challenges**, not parsed model JSON. No further requests were made to those
protected search routes. The staging documentation was readable; only its public
schema was inspected. No calls are made to staging from the extension.

### Printables — anonymous search live verified; cover images pending

See the [Printables integration report](provider-printables.md) for the candidate
query, fields, tests, precise API permission and thumbnail acceptance test.
Codex HTTP requests returned 403, but the user subsequently verified basic search
and a tested card destination in Chromium. No browser-session borrowing, header
impersonation or bypass is used. Full pagination remains a separate pending check.
The following paragraphs preserve the earlier investigation's evidence, rather
than the current implementation disposition.

1–2. Anonymous `https://api.printables.com/graphql/` / `searchPrints2` is a known
technical candidate (earlier investigation returned data), but a permitted
third-party extraction route was not established in that review.
3–5. Public search data did not require credentials in that observation; free key
issuance and acquisition are not applicable to that candidate.
6–7. Candidate GraphQL POST has no documented third-party auth contract; no user
session or store token is borrowed.
8. Earlier observed fields include name, ID/slug, publication date, likes,
downloads and rating. The current minimal parser uses ID/name/slug and valid
numeric likes/downloads only; thumbnails and other mappings remain unverified.
9. [Current Prusa GTC](https://www.prusa3d.com/page/general-terms-and-conditions-of-use-of-the-prusa-websites_231226/)
9.1 restrict unauthorized extraction, including scraping; 9.5 addresses site
content reuse. The [Printables terms](https://www.prusa3d.com/page/terms-of-service-of-printables-com_231249/)
incorporate the general terms. Public reachability alone does not resolve these
conditions. Obtain a permitted integration route before enabling extraction.

Native fallback: `https://www.printables.com/search/models?q={query}`.

### MakerWorld — direct-search-only; public aggregation contract not established

1–2. No supported public catalog API or appropriate HTML route was established.
An earlier ordinary request encountered an access challenge; no adapter is enabled.
3–5. No documented free user search-key program was identified. Credential
requirements, prices and issuance therefore remain **unknown**, not “paid”.
6–8. No approved JSON/GraphQL schema, pagination or metadata contract is asserted.
Rendered model pages alone are not a reliable parsing contract.
9. The [terms route](https://makerworld.com/en/terms-of-use) could not be read;
no legal prohibition is invented from that failure. The concrete technical
limits are the access challenge and lack of an established supported interface.
The [official-hosted public API discussion](https://forum.bambulab.com/t/public-api-for-makerworld/52699)
still contains requests for access, not a public catalog API specification.
No browser context, challenge solver, site token extraction or paid scraper is used.

Native fallback: `https://makerworld.com/en/search/models?keyword={query}`.

### Thangs — direct-search-only; documented scraping prohibition

1–2. No general public catalog-search entitlement was established. Partner and
membership-management API mentions are not public catalog permission.
3–5. Public search API credentials, free issuance and key acquisition remain
unestablished; no claim that API access is paid is made.
6–8. No supported external catalog endpoint/schema is asserted. The visible
search page has model links and filtering, but no HTML adapter is appropriate.
9. The [current content policy](https://thangs.com/resources/legal/content-policy),
updated 30 September 2026, explicitly prohibits automated scraping and bulk
downloading. This prevents using HTML parsing as the fallback aggregation mechanism
without a suitable agreement. No bypass or copied website session is proposed.

Native fallback: `https://thangs.com/search/{encoded-path-query}?scope=thangs&view=grid`.

## Configure and perform the cap acceptance test

1. Run `npm run build`. In `chrome://extensions`, load **this repository's `dist/`**
   unpacked. If already loaded, click Reload so new API host permissions apply,
   then close/reopen old extension pages. Do not load the source folder.
2. Open extension Settings. Each implemented provider has its own section,
   official key link, password-type secret field, Save and Remove buttons.
3. Obtain your own key using the official steps above, only if API access is
   free for your account. Save it **in Settings, never in chat**. Cults also needs
   your nickname. Fields clear; configured status appears. A saved key's presence
   does not certify remote validity or current pricing. No payment is required by tridiJump.
4. Search **cap** in the popup or Results. The three authenticated providers enter
   `searching`; unconfigured ones settle as Setup required. Configured ones send
   real API requests and append cards independently as their responses arrive.
5. Click a model card: its native anchor opens the original repository model URL
   in a normal tab. No model files are downloaded by tridiJump.
6. If denied/blocked, check only the safe provider message, your key scope and
   provider onboarding/terms. Use the native fallback; do not work around a challenge.
   Never share request URLs, headers, screenshots or traces containing your key.
7. Remove a provider's credentials and submit a new search: expect Setup required
   and no request from that provider. Other configured providers continue.

## Verification status

Final checks: `npm test` **139 passed across 14 files**; `npm run typecheck`
passed; `npm run build` passed. Generated entry-page asset references, all three
real API transports and exact host grants were inspected. No fixture models,
fake keys, demo providers or staging hosts were present in the built bundles.

- **Live aggregation working:** none independently verified here; manual acceptance
  remains pending. The review does not claim that mocks prove live compatibility.
- **User credentials supported:** all three documented API paths are connected;
  current free key issuance/fees must still be checked at their official onboarding.
- **Automated pipeline:** actual Settings and Results modules → local Save → actual
  adapters → mocked HTTP → parser → ModelResult[] → actual orchestrator → progressive
  cards/native links. MMF at 300 ms renders before Thingiverse at 700 ms. Cults is
  tested through its actual production entry as well. Synthetic data never ships.
- **Credential/security tests:** missing configuration, exact request/auth, isolated
  401/403, sanitized remote/network/storage errors, provider separation, Remove
  Credentials → Setup required, no secret prefill/sync/history/export, abort and
  stale guards, bounded requests and Retry-After without automatic retry.
- **Permissions:** only `storage`, `https://cults3d.com/*`,
  `https://www.myminifactory.com/*`, `https://api.thingiverse.com/*`.
  No content scripts, cookies, backend, remote code, paid dependency or new package.

Browser discovery returned no connected browser. The HTTP observations above were
ordinary requests with no credentials or browser impersonation; challenges were
stopped. No third-party implementation was copied. API and metadata examples
were used only as protocol documentation; parsers/fixtures are original code/data.
