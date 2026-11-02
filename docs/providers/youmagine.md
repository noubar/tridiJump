# YouMagine API feasibility

Investigated 2026-11-01. YouMagine is implemented in tridiJump as a
**general-tier direct-search provider**, not as an aggregated API provider.

## Decision

**DIRECT SEARCH — CURRENT OFFICIAL API SUPPORT AND PERMISSION ARE UNCLEAR.**

The historical official clients prove that YouMagine once exposed an API, but
they do not establish a currently supported browser-extension integration. The
old authentication scheme requires an application registration, a confidential
application secret, a server-derived signature, user authorization and an
authentication token. tridiJump cannot safely package that secret in an
open-source extension.

The current public site has a stable native search form. tridiJump therefore
opens `https://youmagine.com/explore?query=<QUERY>` only after the user chooses
the native-search link. It does not fetch or parse the page.

No API adapter, credentials UI, host permission, thumbnail display, model-file
download, backend or HTML parser was added.

## Official evidence checked

- [Current YouMagine website](https://youmagine.com/)
- [Current Explore page](https://youmagine.com/explore)
- [Current contact page](https://youmagine.com/information/contacts)
- [Current Terms and Conditions](https://youmagine.com/information/terms_and_conditions)
- [Official YouMagine GitHub organization](https://github.com/YouMagine)
- [Historical official YM-php-sdk](https://github.com/YouMagine/YM-php-sdk)
- [Historical official youmagine-api-client](https://github.com/YouMagine/youmagine-api-client)

The official GitHub organization still describes `YM-php-sdk` as the official
PHP library and `youmagine-api-client` as a library for the API. Their repository
activity and implementation date from 2016. The PHP SDK README directs developers
to register an application through `https://api.youmagine.com/api`.

The PHP implementation fixes the API origin to `api.youmagine.com`, uses `/v1`
JSON resources, and requires an application secret. Its authorization URL uses a
signature derived from application name, secret and the caller's server address;
subsequent requests include an authentication token. The implemented read method
lists designs, but the inspected SDK does not document a public design-search
method, query syntax, pagination contract or anonymous search.

On 2026-11-01:

- `https://youmagine.com/` returned HTTP 200.
- The current public search form was `GET /explore` with input `query`.
- `https://youmagine.com/explore?query=benchy` returned HTTP 200 and remained on
  that canonical URL.
- `api.youmagine.com` did not resolve from the investigation environment, so the
  historical API guide and `/v1/designs.json` were not reachable.
- No authentication, CAPTCHA, anti-bot measure or access control was bypassed.

## Feasibility answers

| Question | Finding |
| --- | --- |
| Historical official API confirmed? | **Yes.** Two official client repositories and the PHP SDK implementation confirm it. |
| Current API reachable? | **No from this environment.** The historical API hostname did not resolve. |
| Current official API supported? | **Unclear.** No current API guide or onboarding route was reachable. |
| Official API search endpoint found? | **No.** The historical inspected SDK exposes design listing but no verified search contract. |
| Public designs searchable? | **Yes through the normal website search.** No supported API search was verified. |
| Anonymous API search? | **Not verified.** |
| Historical authentication | Registered application, confidential secret, signed authorization flow and user authentication token. |
| Safe for an open-source browser extension? | **No, not as documented historically.** A confidential secret cannot be protected in the extension. |
| Ordinary-user credentials available? | **Not currently verified.** |
| Confidential application secret required? | **Yes in the historical official PHP client.** Current requirements are unknown. |
| Third-party aggregation permitted? | **Unclear.** Current terms do not expressly approve tridiJump's aggregation use. |
| API thumbnails may be displayed? | **Unclear.** No current permission was found. |
| Current API metadata/schema | **Unverified.** Do not infer title, creator, price, formats, license or counts from the website. |
| Pagination/rate limits/attribution | **Unverified.** |
| Stable design IDs and canonical URLs | Present on the current site, but no current supported API mapping was verified. |
| Stable native search URL | **Yes:** `GET https://youmagine.com/explore?query=<QUERY>`. |

The current terms mention use of an API but limit copying/reproduction and do not
clearly grant permission for a third-party extension to aggregate and redisplay
titles or images. Public visibility is not treated as permission. Official
clarification is required before any future remote integration.

## Packaged behavior

- Provider ID: `youmagine`
- Display name: `YouMagine`
- Classification: `D`
- Mode: `direct-search`
- Tier: `general`
- Search URL: `https://youmagine.com/explore?query=<original normalized query>`
- Default: enabled, consistent with other direct-search sources
- Credentials: none
- Host permissions: none
- Runtime API requests: none
- Scraping: none
- Normalized fields: none; direct search does not create `ModelResult` objects
- Price semantics: not mapped
- Format semantics: not mapped
- License semantics: not mapped
- Pagination: handled only by YouMagine after the user opens its page

The URL is constructed with `URL` and `URLSearchParams`. Empty and special-character
queries remain safely encoded. Expanded Search does not open multiple native
search pages; the link always uses the original user query.

## Privacy

tridiJump sends nothing to YouMagine during aggregated searching. The query is
sent to YouMagine only when the user explicitly opens the native-search link.
There is no tridiJump backend, credential, analytics or telemetry involved.

## Revisit conditions

Remote aggregation may be reconsidered only after YouMagine confirms:

1. a current supported read-only search API and exact response/pagination schema;
2. an anonymous or public-client authentication flow without a confidential secret;
3. permission for tridiJump's search-and-click-through aggregation;
4. permission to display API-provided thumbnails and public metadata;
5. current rate limits, attribution requirements and CORS/browser-extension support.

The unsent request is preserved in
[youmagine-api-request.md](youmagine-api-request.md).

