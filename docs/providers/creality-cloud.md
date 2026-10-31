# Creality Cloud official API feasibility

Investigated 2026-10-31. Creality Cloud is implemented only as a packaged
**direct-search provider**. This review deliberately used current first-party documentation and
did not inspect or adopt private website/mobile endpoints.

## Decision

**DIRECT SEARCH AVAILABLE; AGGREGATED API SEARCH BLOCKED — NO DOCUMENTED PUBLIC API.**

Creality Cloud clearly provides a searchable 3D-model repository, free and paid
models, creators, previews, categories and cloud-printing features to users of
its own website and applications. Those product features do not establish a
third-party API contract or permission to aggregate them.

No official source reviewed documents a public model-search API, developer/Open
Platform enrollment, third-party application registration, browser-extension
support, public-client OAuth with PKCE, ordinary-user API keys, distributable
read-only application credentials, search scopes, API quotas, API attribution,
or permission to reproduce search metadata/thumbnails in a third-party search
interface. Therefore tridiJump must not build against observed website or mobile
traffic.

Direct Search opens the normal public Models route after explicit user action:
`https://www.crealitycloud.com/search/models?q=<QUERY>&search_type=2&search_source=1`.
It uses the original safely encoded query, makes no background request and does
not reproduce Creality Cloud results inside tridiJump. No aggregated adapter,
native endpoint parser, credential form, host permission, backend or scraper was added.

## Official sources checked

- [Creality Cloud wiki](https://wiki.creality.com/en/creality-cloud) — product
  overview, repository features and supported upload formats.
- [Creality Cloud website](https://www.crealitycloud.com/) — first-party model
  library and native navigation.
- [Creality Cloud `cp` site](https://cp.crealitycloud.com/) — currently presents
  the consumer Creality Cloud site/support experience, not public developer API
  documentation.
- [Help Center](https://www.crealitycloud.com/help-center/62ec91a478c9f43d908fc7b2)
  and [Support & Service](https://cp.crealitycloud.com/service-center) — account,
  model, marketplace, slicing and printer help; no third-party search API guide.
- [User Agreement landing page](https://www.crealitycloud.com/policy/user-agreement)
  — general platform agreement exists, but no API-specific terms or integration
  permission were exposed by the reviewed official material.
- [Official robots guidance](https://www.crealitycloud.com/robots.txt) — applies
  a crawl delay and disallows `/search` routes. Robots guidance is not an API
  license, but it reinforces the decision not to substitute crawling for an API.
- [Official Creality Cloud service notice](https://pre-3.crealitycloud.com/post-detail/6842cd7da317339c9a6e3653)
  and official Help Center articles identify `teamcloud@creality.com` as a
  Creality Cloud contact route.

Searches limited to current official Creality domains did not find an API,
developer, Open Platform, OAuth or third-party model-search specification. This
is a documentation finding, not a claim that Creality has no private partner or
internal interfaces.

## Feasibility answers

| Question | Finding |
| --- | --- |
| Documented public API | **No** official third-party API was found. |
| Documented model-search endpoint | **No.** Native website search is not an API contract. |
| Developer portal / Open Platform | **No documented portal found.** `cp.crealitycloud.com` is not presented as one. |
| Third-party application registration | **Unknown; no documented enrollment path.** |
| Browser-extension use | **Unknown; not documented or approved.** |
| Authentication required | **Unknown** because no supported API contract was found. |
| API key / OAuth / bearer / app ID / client secret | **Unknown; none documented for third-party model search.** |
| Public-client authentication | **Unknown; unsupported by available documentation.** |
| OAuth Authorization Code + PKCE | **Not documented.** |
| Confidential client secret mandatory | **Unknown.** tridiJump would stop if one were required. |
| Ordinary-user personal API credentials | **Not documented.** |
| Credentials permitted in public applications | **Not documented.** |
| Display of API-returned model metadata | **Unclear; no API/display grant found.** |
| Display of API-returned thumbnails | **Unclear; no API/image grant found.** |
| Third-party search aggregation | **Unclear; no permission found.** |
| Click-through links | Native public pages exist, but an API integration and its branding/linking terms are **not documented**. |
| Quotas / rate limits | **Not documented for a third-party search API.** |
| Attribution / branding requirements | **Not documented for an API integration.** |
| API terms | **No API-specific terms found.** General User Agreement only. |
| Automation / indexing restrictions | Official robots guidance disallows `/search`; no reviewed terms authorize automated aggregation. |

## Public-client and security assessment

tridiJump is open source and its Chrome, Edge and Firefox packages are public.
It cannot safely hold a confidential API key, client secret, partner bearer
token, session cookie, CSRF token or account token. Minification would not change
that. The existing local credential mechanism is not a reason to invent user-key
support where Creality has not documented user issuance and permitted use.

No account session, internal mobile API, undocumented JSON endpoint, request
signature, browser automation, HTML/DOM parsing, CAPTCHA handling or anti-bot
workaround was used or proposed.

## Product metadata observed in official documentation

The official wiki describes Creality Cloud as a model repository and documents
uploaded model formats including STL, OBJ, PLY, OFF, 3MF, 3DS, WRL, DAE, STEP and
STP. Official Help Center material also describes free and paid model publishing
and Creality credits. These website capabilities must not be mapped into
`ModelResult` until an approved API demonstrates which fields and semantics it
actually returns.

Consequently no live searches (`benchy`, `car`, `gear`, `phone stand`), response
normalization, pagination, price mapping, format mapping, sorting or filtering
were attempted. Doing so through undocumented production endpoints would violate
the task's feasibility gate.

## Conditions for revisiting

Implementation can be reconsidered only after Creality confirms and documents:

1. an official model-search endpoint and stable response/pagination contract;
2. permission for tridiJump's read-only aggregation, preview display and direct
   model-page links;
3. public-client-compatible authentication: anonymous access, OAuth Authorization
   Code + PKCE without a secret, ordinary-user keys approved for this use, or an
   explicitly public/distributable read-only credential;
4. exact API/media origins, scopes, quotas, rate limits and CORS behavior;
5. metadata, price/credits, formats, content flags, attribution, branding,
   privacy and store-listing requirements.

Until then Creality Cloud is classification **D: no appropriate aggregation
interface established**, remains direct-search-only in the packaged provider list,
and receives no host permission. The [prepared contact request](creality-cloud-api-request.md)
can be sent manually by the maintainer; tridiJump sends nothing automatically.
