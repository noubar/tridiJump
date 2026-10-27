# Live provider investigation

Research date: **2026-10-27**. This is a research document, not an implementation
or authorization to ship an integration. No live providers, dependencies,
permissions, credentials, or provider-interface changes were added.

## Scope and evidence

Reviewed the current README, manifest, provider/result contracts, orchestrator,
and results/demo wiring. The application currently runs local demo providers;
its manifest has no host permissions. The existing
`search(query, signal?): Promise<ModelResult[]>` contract remains suitable.

Research used public first-party documentation, indexed first-party pages, and
a few ordinary anonymous HTTP requests. No login, cookie/token extraction,
CAPTCHA solving, browser impersonation, challenge execution, or anti-bot bypass
was used. No third-party proxy or scraper service was used. Third-party search
hits were discovery leads only, not evidence for endpoint contracts.

Evidence labels used below:

- **Observed**: direct HTTP response in this session.
- **Documented**: first-party documentation, not a successful authenticated call.
- **Page-visible**: first-party content extracted by the research web tool. This
  does not prove that the same content exists in an initial, script-free response.
- **Unverified**: not established; do not treat as an implementation assumption.

There was no connected interactive browser. Consequently, live network traces,
client-side navigation, and the SSR/client-rendering split could not be verified.
An access challenge was recorded as a limit, not worked around. Web-tool `402`
errors below are retrieval errors, not evidence that a paid account is required.

## Recommendations and ranking

Letters: **A** official API; **B** public endpoint; **C** HTML parsing;
**D** browser-context technique; **E** direct-search fallback only.

The ranking weighs a supported integration contract and operational stability,
assuming access can be legitimately obtained. It is an engineering assessment,
not a claim that the first three work without credentials. For the current
account-free extension, Printables is the only anonymous data route actually
verified here, and its usage permission still needs resolution.

| Rank: easiest/stablest first | Provider | Recommended mechanism | Release gate / current disposition |
| --- | --- | --- | --- |
| 1 | Cults3D | **A — official GraphQL API** | Explicit metadata-embedding use case and examples. Requires a nickname/API key. Until an authorized credential/distribution arrangement fits this project, use E. |
| 2 | MyMiniFactory | **A — official REST API** | Published search schema; requires API-client authentication. Verify current production schema, credential issuance, and API/content terms; otherwise E. |
| 3 | Thingiverse | **A — official REST API** | Public v2 Swagger exists, but staging documentation and older developer flows need production/access confirmation. Requires authorized credentials; otherwise E. |
| 4 | Printables | **B — public GraphQL endpoint, conditional candidate** | One anonymous search worked. No supported third-party contract or metasearch/thumbnail permission established. Resolve those before release; otherwise E. |
| 5 | MakerWorld | **E — direct-search fallback only** | No public search API contract found; access challenges prevented verification. Request a supported integration arrangement rather than depending on undocumented web calls. |
| 6 | Thangs | **E — direct-search fallback only** | Current content policy prohibits automated scraping. Partner APIs are mentioned, but no public catalog-search entitlement was established. |

None is recommended for C or D today. Parsing visible HTML would not settle
permission, and executing site JavaScript or borrowing a logged-in browser
context would add permissions, session dependencies, and fragility. A normal
user-opened search tab is E, not a technique for collecting results through D.

## Manifest V3 and CORS: common implications

From an extension-origin results page or service worker, cross-origin `fetch`
can use granted host permissions; a background worker is not required merely
to solve CORS. Content-script requests remain subject to the page origin's
rules. `no-cors` cannot provide readable JSON. A host grant does not override
authentication, rate limits, access challenges, or service terms.
[Chrome cross-origin request documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

The host patterns below are **prospective**, not manifest changes. Host
permissions are origin-wide (path matching does not limit their authority).
Request only the actual API origin, preferably when a provider is enabled.
Do not request `<all_urls>` or wildcard subdomains just in case. If a future CSP
restricts `connect-src`/`default-src`, account for the chosen API there too.

| Provider | Host grant for a future data integration | Current recommended fallback |
| --- | --- | --- |
| Printables | `https://api.printables.com/*`; `https://www.printables.com/*` only if an independently approved HTML route is used | No host grant to open the search URL |
| MakerWorld | None now; hypothetical same-origin endpoint would need `https://makerworld.com/*`, but its actual origin is unverified | No host grant |
| Thingiverse | `https://api.thingiverse.com/*`; do not ship access to the staging API | No host grant |
| Thangs | None now; `https://thangs.com/*` would only cover same-origin requests under a future agreement, not an unverified separate API host | No host grant |
| MyMiniFactory | `https://www.myminifactory.com/*`; OAuth hosts would require a separate, expressly approved authentication feature | No host grant |
| Cults3D | `https://cults3d.com/*` | No host grant |

Ordinary outbound links/new tabs do not need a host grant or the broad `tabs`
permission. Displaying an ordinary remote `<img>` differs from fetching its bytes
for parsing/canvas: do not add CDN host permissions unless needed for a concrete
operation. Verify image-display rights and any future `img-src` policy separately.

The successful Printables JSON response and the MyMiniFactory `401` response
had no `Access-Control-Allow-Origin` header on requests without an `Origin`
header. This is not a complete CORS/preflight test. The Thingiverse staging
documentation page returned `*`; that says nothing about production search.
No real-extension network test was performed for any provider.

## Printables

**Recommendation: B, conditional; E until the release gate above is resolved.**

| Topic | Finding |
| --- | --- |
| Official API / authentication | No supported public developer search API documentation was found. The web GraphQL endpoint is observable; it must not be described as an official third-party API. Anonymous access worked for the single read tested. |
| Search / JSON / GraphQL | **Observed:** `POST https://api.printables.com/graphql/` with JSON and no cookies, credentials, or special browser headers returned HTTP 200 and a `data.searchPrints2` payload. The tested operation used `query`, `limit: 1`, and `offset: 0`. A bare GET returned JSON HTTP 400, which alone would not prove search access. |
| Pagination | `limit` and `offset` were accepted, with `totalCount` and `items` returned. Multiple pages, maxima, and completeness were not tested. Start with a bounded first page if use is approved. |
| HTML / client rendering | The public search page was page-visible through the web tool, with models and filters. An ordinary raw request returned 403; it was stopped. Initial SSR completeness and client request behavior remain unverified. Do not substitute HTML parsing for the verified JSON candidate. |
| CORS / permissions | Apply the common MV3 guidance; API-origin host permission would be needed. No browser-origin CORS claim is made from the anonymous HTTP test. |
| Fragility | Medium/high: anonymous access works today, but operation names, schema, free/store coverage, quotas, and continued third-party use are not guaranteed. A user-interface schema is not a versioned integration agreement. |

Verified JSON metadata: `id`, `name`, `slug`, `ratingAvg`, `likesCount`,
`downloadCount`, and `datePublished`. The rating was a numeric **string**, so an
adapter would need finite-number validation. The search page also exposed
creator links and a Free section. API thumbnail/creator fields, formats, store
prices/currency, and complete paid coverage were not tested. Do not infer that
the entire repository is free. `datePublished` is publication, not proven creation.
[Observed endpoint](https://api.printables.com/graphql/),
[first-party search page](https://www.printables.com/search/models?q=benchy)

**Restrictions:** [robots.txt](https://www.printables.com/robots.txt) returned
200; its general rule allows `/` and excludes `/world/`. That is crawler guidance,
not a license for metadata/thumbnail redistribution or an API support promise.
The [Printables terms](https://www.prusa3d.com/page/terms-of-service-of-printables-com_231249/)
incorporate the [general Prusa terms](https://www.prusa3d.com/page/general-terms-and-conditions_231226/)
and distinguish creators' content licenses from the operator's rights. No explicit
third-party metasearch authorization or numeric API quota was established.
Confirm the intended extension use, image display, and request budget with Prusa.
Do not copy model content or download files as part of search.

Fallback: `https://www.printables.com/search/models?q={query}`. The sample
search route was page-visible; raw fetch availability was not reliable.

## MakerWorld

**Recommendation: E.** No reliable, approved data route was established.

| Topic | Finding |
| --- | --- |
| Official API / authentication | No first-party public catalog-search API documentation or developer key issuance was found. This is a research limit, not proof that private/partner APIs do not exist. No session or token was acquired. |
| Search endpoints | Candidate user-facing route: `https://makerworld.com/en/search/models?keyword={query}`. The research web tool could not retrieve the sample route (402 retrieval error). |
| JSON / GraphQL | No specific JSON search endpoint, request body, GraphQL endpoint, or anonymous access contract was independently verified. Do not promote paths found in third-party reverse-engineering posts into supported endpoints. |
| HTML / client rendering | Search HTML was not available for inspection. Whether initial HTML includes complete cards or subsequent JavaScript loads them is unverified here. No browser network trace was available. |
| Pagination | Unverified. Do not assume `page`, `offset`, cursors, or a Next.js data route. |
| CORS / permissions | No grant for E. Under a future supported API, verify its precise origin before requesting access; host permission does not clear an anti-bot challenge. |
| Fragility | Very high for an undocumented web integration: no supported schema established and an ordinary robots request encountered an access challenge. A first-party partnership would change this assessment. |

**Metadata:** search-response title, model URL, thumbnail, price/free status,
creator, formats, dates, downloads, ratings, and popularity are all unverified.
The [official Bambu model-resource manual](https://csm.bblcdn.com/hub/4668d0ca43994ff3bff4b37f1a65c2e7.pdf)
describes the platform and STL/CAD/3MF downloads; general format support does not
establish which formats a specific search result has. Do not label every model
free or treat boosts, points, print profiles, and likes as interchangeable scores.

**Restrictions:** [robots.txt](https://makerworld.com/robots.txt) returned a
Cloudflare challenge with HTTP 403; the rule contents were not obtained.
The [user-agreement page](https://makerworld.com/en/user-agreement) also could
not be retrieved through the research tool. Thus, no specific automation clause
is asserted or cleared. The [official security white paper](https://cdn1.bambulab.com/trust-center/file/bambulab-security-whitepaper-en.pdf)
discusses content/IP controls, but does not grant metasearch API rights.
Obtain current terms and integration permission from MakerWorld before any
endpoint/HTML work. Do not use browser-context execution as a workaround.

Fallback candidate: `https://makerworld.com/en/search/models?keyword={query}`.
Confirm it in an ordinary user browser before shipping; do not promise challenge-free access.

## Thingiverse

**Recommendation: A with authorized access; E for the current credential-free scope.**

| Topic | Finding |
| --- | --- |
| Official API / authentication | The public [v2 Swagger document](https://api-staging.thingiverse.com/v2/doc) was directly readable. It declares HTTP Bearer/JWT security and lists production `https://api.thingiverse.com`. The legacy [developer portal](https://www.thingiverse.com/developers) was blocked in this research. Confirm a supported third-party credential flow; do not assume old app tokens work with v2. |
| Search / JSON | Documented `GET /v2/search/things?term={query}&page=1&per_page=20`, with JSON `hits` and `total`. This was schema inspection, not a successful production search. The document identifies itself as version `0.0.0`; staging/production parity is not established. |
| GraphQL | No first-party GraphQL search contract found; REST is the documented candidate. |
| Pagination | Documented 1-based `page`, default 1; `per_page` defaults to 20 and has maximum 50. `return` can select summary/complete/custom. |
| HTML / client rendering | User search and developer pages were unavailable to the research tool; ordinary robots access returned a challenge. SSR completeness and runtime search requests remain unverified. Do not recommend scraping the shell or extracting the website's token. |
| CORS / permissions | Production API host grant only if approved. Staging docs' permissive CORS is not evidence about authenticated production requests. |
| Fragility | Medium with a supported production API/key; high while API generation and third-party token compatibility are unsettled. Confirm deployment before choosing v1 or v2. |

The v2 summary schema lists title (`name`), `public_url`, ID, `thumbnail`,
`preview_image`, `creator`, `created_at`, `like_count`, and `is_premium`.
Complete responses add more fields, but no retail amount/currency or normalized
rating was confirmed. `is_premium` needs a documented semantic mapping; do not
assume the entire catalog is free. Formats and download counts were not present
in the inspected summary fields. A search-filter description refers to legacy
detail `download_count`; this does not make it a v2 summary field.
[First-party Swagger schema](https://api-staging.thingiverse.com/v2/doc)

**Restrictions:** [MakerBot terms](https://www.makerbot.com/legal/terms-of-use/)
section 3.3 restrict automated searches/scraping and include a limited, revocable
public-search-index exception. Do not assume this local extension qualifies for
that exception. Confirm the currently applicable Thingiverse/API terms and
permission rather than relying on legacy brand terms alone.
[robots.txt](https://www.thingiverse.com/robots.txt) returned a 403 challenge;
its contents were not verified. The Swagger document mentions a view-token
endpoint, but that is not an instruction to obtain or reuse the website's token.

Fallback candidate: `https://www.thingiverse.com/search?q={query}&type=things`.
The sample route could not be validated in a normal interactive browser here.

## Thangs

**Recommendation: E.** Request a separate agreement before considering data integration.

| Topic | Finding |
| --- | --- |
| Official API / authentication | No general public catalog-search API or public key program was established. The first-party [Help Center](https://thangs.com/resources/help-center) mentions membership APIs for exclusive sellers and custom model/membership management APIs. Those are not a public anonymous search entitlement. Authentication and access would depend on that agreement. |
| Public search | The page-visible [search route](https://thangs.com/search/free?scope=thangs&view=list) contains model/designer results, cost/file-type controls, and sorting. Restrict a fallback to `scope=thangs` when intending hosted models rather than a broader metasearch. |
| JSON / GraphQL | No approved public search JSON or GraphQL contract verified. No internal endpoint enumeration or session reuse was performed. |
| HTML / client rendering | Extracted search content was readable. Initial SSR versus client population was not established, and no dynamic request tracing was done. Readability is not permission to parse it automatically. |
| Pagination | Unverified for a supported API; do not assume numeric pages, offsets, or an infinite-scroll cursor. |
| CORS / permissions | No grant for E. A future partner API needs its documented host and credential rules, not guessed website permissions. |
| Fragility | Highest overall for an unapproved integration: explicit scraping restriction plus no suitable public API contract. A partner agreement is a prerequisite, not a browser trick. |

**Metadata:** the public search output shows titles, model URLs, creator links,
image links, and download/purchase-related UI. Complete model-thumbnail coverage
was not confirmed. Its cost and file-type controls do not prove per-result API
metadata. Numeric price/currency, exact free status, formats, creation/publication
dates, downloads, and normalized ratings/popularity need verification
under an approved route. Membership/bundle access must not be represented as
free or confused with a one-time model price.
[First-party search](https://thangs.com/search/free?scope=thangs&view=list)

**Restrictions:** the [content policy](https://thangs.com/resources/legal/content-policy),
dated 2026-09-30, explicitly prohibits automated scraping and bulk downloading.
The [terms](https://thangs.com/resources/legal/terms-and-conditions) also address
unauthorized collection and reverse engineering. The permissive-looking general
[robots.txt](https://thangs.com/robots.txt) response (200, no general Disallow)
does not cancel those restrictions. Browser-context parsing is therefore not
recommended. Contact support for a catalog-search agreement if this source matters.

Fallback: `https://thangs.com/search/{pathQuery}?scope=thangs&view=grid`.
The same route family was confirmed through a first-party search link; do not
reuse query-parameter encoding for its path segment.

## MyMiniFactory

**Recommendation: A with authorized API-client access; otherwise E.**

| Topic | Finding |
| --- | --- |
| Official API / authentication | First-party [API documentation](https://github.com/MyMiniFactory/api-documentation) and [README](https://github.com/MyMiniFactory/api-documentation/blob/master/README.md) exist. API-client authentication is required; the README links client creation through account settings. Credential issuance was not tested. |
| Search / JSON | The [OpenAPI specification](https://raw.githubusercontent.com/MyMiniFactory/api-documentation/master/myminifactory-api.yaml) documents `GET https://www.myminifactory.com/api/v2/search?q={query}` returning `items` and `total_count`. It describes a query `key` authentication scheme and OAuth alternatives. **Observed:** a keyless search returned JSON HTTP 401 (`Authentication required`). |
| GraphQL | No public GraphQL search contract found; use the documented REST candidate. |
| Pagination | `page` is documented as 1-based, default 1; `per_page` defaults to 30. Search also has sort/order parameters. Production limits were not authenticated/tested. |
| HTML / client rendering | Search HTML was unavailable to the research tool; the developer and terms pages returned 403. SSR/client-rendering behavior is unverified. HTML parsing is not a substitute for required API credentials. |
| CORS / permissions | Production website/API origin host grant would be needed. No successful credentialed extension request or browser preflight was tested. |
| Fragility | Low/medium for documented metadata with valid access, but the published schema has inconsistent security-scheme references and is not proof of complete/current marketplace metadata. Confirm against production before coding. |

The documented Object schema has ID, name, URL, designer, images, file records,
publication time (`published_at`), likes, and views. File names can establish
extensions when actually returned; do not infer archive contents. Price/free
fields, download totals, and normalized ratings were not found in the inspected
Object schema. Missing price does not imply free. Some file download URLs are
explicitly restricted to OAuth-connected users; search needs no file downloads.
[Official schema](https://raw.githubusercontent.com/MyMiniFactory/api-documentation/master/myminifactory-api.yaml)

**Restrictions:** [developer page](https://www.myminifactory.com/pages/for-developers)
and [terms](https://www.myminifactory.com/pages/terms-and-conditions) need manual
review because access was blocked here. No API quota or redisplay license was
confirmed. [robots.txt](https://www.myminifactory.com/robots.txt) returned 200,
with general Allow and content signals permitting search while reserving other
uses, including AI training. Those signals are not an unrestricted API license,
and more-specific named-agent rules also exist. Respect them; no bulk crawl is proposed.

Fallback candidate: `https://www.myminifactory.com/search/?query={query}`.
Verify current browser routing before release; it was not interactively validated.

## Cults3D

**Recommendation: A with an authorized API key; otherwise E.**

| Topic | Finding |
| --- | --- |
| Official API / authentication | The official [API overview](https://cults3d.com/en/api) specifically describes displaying designs on other websites and linking visitors back. The [GraphQL guide](https://cults3d.com/en/pages/graphql) requires HTTP Basic Auth using a Cults nickname and a generated API-key secret, not an account password. No key was requested or used. |
| Search / JSON / GraphQL | Documented `POST https://cults3d.com/graphql`. The officially linked [query examples](https://gist.github.com/sunny/07db54478ac030bd277c19cfe734648b) demonstrate `creationsSearchBatch(query, limit)` returning `total` and `results`. No separate REST search route is needed. |
| Pagination | Official batch examples demonstrate `limit`/`offset`; the search example demonstrates `limit`. Confirm the current search-specific `offset` argument and limit in the authenticated explorer rather than assuming every batch shares them. |
| HTML / client rendering | User-facing HTML search exists as a fallback candidate, but raw rendering and runtime search behavior were not verified. No reason to reverse-engineer it when an official API exists. |
| CORS / permissions | Cults origin host grant for the API. Basic authorization is an explicit credential requirement, regardless of host permission. No authenticated CORS/preflight or production response was tested. |
| Fragility | Lowest relative to the other candidates: deliberate third-party metadata use, official examples, and rate-limit guidance. Still verify the current authenticated schema and content-display conditions. |

Official examples cover name, URL/short URL, illustration URL, creator nickname,
publication date, views, likes, downloads, and price in a requested currency with
`cents`. Convert minor units correctly for the selected currency; do not claim
an unknown price is free. Public-result formats and a normalized numeric rating
were not established. The own-design file example is not evidence of access to
other creators' files. Publication is not necessarily creation time.
[Official examples linked by Cults](https://gist.github.com/sunny/07db54478ac030bd277c19cfe734648b)

**Restrictions:** the [GraphQL guide](https://cults3d.com/en/pages/graphql)
documents dynamic limits and `x-ratelimit-limit`, `x-ratelimit-remaining`, and
`x-ratelimit-reset` response headers. Do not hardcode an invented quota. The
[API overview](https://cults3d.com/en/api) says other creators' model files remain
on Cults; a metadata integration should link back. The [NoAI policy](https://cults3d.com/en/pages/no-ai)
restricts AI exploitation and unauthorized content copying; API access does not
erase creators' rights. This project has no AI features. Confirm current API
terms/image-display permission and avoid blanket scraping. Direct robots/guide
retrieval returned 403 through the research tool, so indexed first-party docs
were used; no challenge was bypassed and current robots rules are unverified.

Fallback candidate: `https://cults3d.com/en/search?q={query}`.
Interactive routing was not validated in this session.

## Fallback encoding and implementation implications

For a query parameter, use `URL` plus `searchParams.set`/`URLSearchParams`; never
concatenate raw user input. For the Thangs path segment, encode that segment
with `encodeURIComponent`, then set remaining parameters separately. The URL
templates above are documentation placeholders, not strings to interpolate raw.
Test spaces, non-ASCII characters, `&`, `+`, `#`, and `/` before shipping links.
Do not call a fallback page through `provider.search` and pretend that opening
a tab produced an empty successful search. A fallback is a separate UI action.

No provider-interface redesign is justified:

- A bounded first page fits `Promise<ModelResult[]>`; pagination can stay inside
  each adapter initially. Do not add streaming/page/capability layers now.
- API keys are an **access/product constraint**, not a reason to add a key
  parameter to every search. The extension has no approved credential setup.
  A distributed browser extension cannot keep a bundled secret confidential.
  Do not embed an operator's key, add a credential proxy/backend, reuse website
  tokens, or introduce account flows to make these routes appear account-free.
  Confirm an authorized distributable/public-client arrangement, or keep E.
- Only normalize metadata actually returned. Never turn likes/views into a
  universal relevance or star-rating score. Do not convert currencies without
  an explicit supported policy. Missing price/format data stays unknown.
- Several sources expose **publication**, not creation dates. The current
  `createdAt` comment describes creation. Decide that semantic mapping before
  populating it; do not silently relabel publication as creation or change the
  interface during this investigation.
- Existing abort/timeout/stale-response handling can be retained. Approved
  adapters should honor signals and treat authentication failures, 429s, access
  challenges, schema changes, and malformed responses as failures, not no-results.
- Host permission, server reachability, public visibility, robots guidance,
  creator licenses, and permission for third-party use are separate questions.
  They all need resolution for the chosen route; no one item answers the rest.

## Verification record and next decision

| Check performed | Result on research date |
| --- | --- |
| Printables GraphQL, anonymous bounded read | HTTP 200 JSON with one model and count; no credentials or cookie |
| Printables bare GraphQL GET | HTTP 400 JSON; not a search |
| Printables raw search HTML | HTTP 403; stopped, no challenge bypass |
| MyMiniFactory anonymous search | HTTP 401 JSON; no credential attempts |
| MyMiniFactory official schema and README | HTTP 200 on the organization's public GitHub sources |
| Thingiverse Swagger document | HTTP 200, embedded public OpenAPI inspected; not an authenticated search |
| Printables / Thangs / MyMiniFactory robots | HTTP 200; guidance summarized above |
| MakerWorld / Thingiverse robots | HTTP 403 challenge; stopped |
| Cults robots and GraphQL guide via web tool | HTTP 403; no direct/authenticated retry; indexed first-party documentation and its linked examples available |
| MakerWorld search and agreement via web tool | Retrieval failed (402); not interpreted as a paid API response |
| Browser sessions / CORS preflight | No connected browser; not tested |

This is sufficient to choose research priorities, not to claim all six live
routes are production-ready. First resolve Printables' intended third-party
use and the three official APIs' access/distribution conditions. Keep MakerWorld
and Thangs as user-opened searches unless their operators provide a supported
arrangement. Before implementation, recheck source terms and robots guidance,
verify any candidate fallback route in a normal browser, and save small approved
response fixtures for adapter contract tests. No providers are implemented here.
