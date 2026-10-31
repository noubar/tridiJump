# CGTrader API feasibility

Investigated 2026-10-31. CGTrader API aggregation is **not** implemented in tridiJump.
This record uses only CGTrader's current official developer pages and one
anonymous request to its documented read-only endpoint.

## Decision

**BLOCKED — PARTNER APPROVAL REQUIRED.**

CGTrader's official API could support the result metadata tridiJump needs, but
the currently documented authentication model is not appropriate to ship in a
public open-source browser extension without CGTrader approving tridiJump and
providing an authentication method suitable for a public client.

CGTrader is available only as a direct-search entry that opens its normal search
page after an explicit user action. No aggregated provider adapter, credential
form, manifest permission, live thumbnail, backend or scraper was added.
tridiJump must never package a maintainer's API
key, OAuth client secret, bearer token or other CGTrader partner credential.

## Official documentation checked

- [CGTrader for Developers](https://www.cgtrader.com/developers)
- [REST API v1 index](https://api.cgtrader.com/docs/)
- [Authentication](https://api.cgtrader.com/docs/authentication.html)
- [API overview and documented OAuth example](https://api.cgtrader.com/docs/overview.html)
- [`GET /v1/models`](https://api.cgtrader.com/docs/_v1_models_get_43380.html)
- [API error reference](https://api.cgtrader.com/docs/errors.html)
- [General Terms and Conditions](https://www.cgtrader.com/pages/terms-and-conditions)

The API documentation remains officially hosted, but several pages identify
their documentation copyright/version as 2013–2016. CGTrader should confirm the
current contract, authentication method, quotas and response schema before a
future implementation.

## Authentication findings

- `GET /v1/models` is explicitly marked **Login Required: true**.
- An anonymous `GET` with harmless `keywords=car`, `per_page=1` and
  `adult_content=false` returned HTTP 401 on 2026-10-31. The response advertised
  Bearer authentication and described the access token as invalid.
- The authentication guide says every request uses one of the account's API
  keys and warns that API keys carry many privileges and must remain secret.
- The developer page directs applicants to **Request API key** and asks them to
  describe their intended integration. It presents the API for developers and
  large-scale customers, including searching structured model data and
  integrating the store in other software.
- The official OAuth example uses Authorization Code with both `CLIENT_ID` and
  `CLIENT_SECRET`. It does not document PKCE, secretless public clients, browser
  extension registration, device authorization, or another public-client flow.
- The official material does not establish that ordinary tridiJump users can
  self-issue an API key approved for this use. Account key management after
  access is granted is not evidence of open enrollment.

Consequently, user-supplied CGTrader credentials cannot be enabled merely by
reusing tridiJump's local credential storage. Eligibility, intended privileges
and public-extension use first need explicit CGTrader confirmation. Minification
or obfuscation would not protect a bundled secret.

## Documented search capability

The official endpoint is `GET https://api.cgtrader.com/v1/models`. Its documented
parameters are:

- `keywords`, `page`, `per_page`
- `min_price`, `max_price`
- `product_type` (`cg` or `printable`)
- `category_id`, `extensions`
- `adult_content`, `discounted`
- `low_poly`, `animated`, `pbr`, `rigged`, `collection`
- `min_admin_rating`, `polygons`, `license`
- `sort` (`best_match`, `sales`, `newest`, `oldest`, `lower_price`,
  `higher_price`)

The documented default for `page` is 1 and for `per_page` is 25. A future
tridiJump integration must explicitly send `adult_content=false` even though the
documentation also describes false as the default.

The documentation's example response contains total count, model ID, author,
canonical URL, title, description, downloadability, type, license, tags, price,
file extensions and thumbnails. These are documentation examples, not a live
authenticated schema verification. Currency semantics, current media hosts,
rate limits and Retry-After behavior were not documented by the pages reviewed
and must not be guessed.

## Conditions for revisiting

Implementation can be reconsidered after CGTrader confirms all of the following:

1. tridiJump's read-only search-and-click-through use is approved.
2. Preview metadata/images may be displayed in this extension.
3. Authentication is suitable for a public browser client: PKCE without a
   client secret, a narrowly scoped user key ordinary users may obtain, or
   another explicitly approved public-client mechanism.
4. The key/token has read-only scope appropriate to `GET /v1/models`.
5. Current quotas, rate-limit behavior, CORS behavior, price currency and
   response schema are documented.

Until then, CGTrader stays outside the aggregated provider list. Its packaged
direct-search entry uses only the original query and sends nothing until the user
opens the normal CGTrader search page.

