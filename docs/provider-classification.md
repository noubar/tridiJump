# V1 authenticated-provider classification

Historical staged investigation/review: current implementation and release status
are recorded in [the final audit](release-audit.md) and
[supported repositories](supported-repositories.md). Earlier verification limits
below are dated evidence, not current all-provider support claims.

**Superseded 2026-10-28:** see the [live enablement review](live-provider-enablement.md).
Three official user-key adapters are now wired into production; all-fallback is
no longer the current disposition. Authenticated live verification and current
free issuance remain explicitly pending, not grounds to assert that no API exists.
The text below preserves the earlier investigation's decision record.

Rechecked 2026-10-27 against the user's special authenticated-provider policy.
These **A–D product classifications** differ from the **A–E retrieval mechanism**
letters in the historical investigation. This document supersedes its release
dispositions, not its retained technical observations.

- **A:** appropriate aggregation without credentials.
- **B:** appropriate official API with reasonably obtainable free user credentials.
- **C:** API access specifically requires payment; investigate legitimate public/HTML
  alternatives before falling back.
- **D:** no appropriate aggregation interface available to this V1 implementation.

Classification is based on the evidence available, not guessed billing or a claim
that an API does not exist. D may be provisional because eligibility cannot yet
be established. Missing a live development key alone is never grounds for D.

## Current decisions

| Repository | Classification for V1 | Evidence and disposition |
| --- | --- | --- |
| Printables | **D** | The earlier anonymous GraphQL observation establishes technical access, not authorized aggregation. Current Prusa GTC 9.1 restrict unauthorized extraction, including scraping; 9.5 restrict other uses of site components/content without consent. No supported third-party search contract or applicable permission was established. Use native search, not GraphQL/HTML parsing. |
| MakerWorld | **D** | No supported public catalog-search contract or free user API program was verified. Earlier search/API access challenges were stopped. Terms retrieval was unavailable in this recheck. Do not depend on internal endpoints, session tokens, or scraping around those conditions. Use native search. |
| Thingiverse | **D, provisional** | A developer program and first-party staging v2 Swagger exist. Current developer onboarding, free token issuance, production API version/token compatibility, and applicable API terms could not be verified. Developer/getting-started/legal pages returned 403. Staging docs alone do not establish a usable production contract. Use native search pending those checks, not the site's view-token/session endpoints. |
| MyMiniFactory | **D, provisional** | Official README/OpenAPI document account-created API clients and authenticated search. They do not explicitly establish current free ordinary-user key issuance or extension-use conditions. Developer page returned 403. No paid API requirement was established either. Use native search until eligibility is verified; do not switch to scraping to avoid keys. |
| Thangs | **D** | No public catalog-search entitlement was established. Its current content policy explicitly prohibits automated scraping/bulk downloading. Partner or membership-management APIs are not evidence of public catalog access. Use native search scoped to Thangs. |
| Cults3D | **D, provisional; existing adapter preserved** | Official metadata API is suitable in shape and documents nickname/key authentication, but explicit free API access remains unconfirmed. The latest user instruction conditions use on that confirmation. Production therefore does not dispatch the existing adapter, even when a previous version saved a key. Native search remains available. |

No provider is classified C merely because it sells models, memberships or creator
subscriptions. No A/B integration was confirmed in this recheck. The unresolved
items above are access/eligibility evidence, **not unavailable development credentials**.
If first-party evidence establishes B, use the official API and existing local
credential mechanism with fixtures/mocks; live authenticated testing can remain pending.

## First-party sources and verification limits

- [Current Prusa GTC, Article 9](https://www.prusa3d.com/page/general-terms-and-conditions-of-use-of-the-prusa-websites_231226/)
  and [Printables terms](https://www.prusa3d.com/page/terms-of-service-of-printables-com_231249/).
  The GTC is effective 20 April 2026. The earlier abbreviated general-terms URL
  was unavailable; its current canonical page was readable. No new automated
  catalog request was needed to decide against unapproved extraction.
- [MakerWorld terms route](https://makerworld.com/en/terms-of-use) was unavailable
  through the research tool. No contents or permission are inferred from that failure.
  See the original investigation for the earlier access-challenge observations.
- [Thingiverse developer guide](https://www.thingiverse.com/developers/getting-started),
  [API terms](https://www.thingiverse.com/legal/api),
  [first-party staging API v2 documentation](https://api-staging.thingiverse.com/v2/doc),
  and [first-party developers group](https://www.thingiverse.com/groups/developers).
  Staging Swagger and historical group posts were readable; they do not resolve
  current production enrollment or pricing. Third-party claims of free App Tokens
  were discovery leads only, not current eligibility evidence.
- [MyMiniFactory official README](https://github.com/MyMiniFactory/api-documentation/blob/master/README.md),
  [official OpenAPI](https://github.com/MyMiniFactory/api-documentation/blob/master/myminifactory-api.yaml),
  and [developer page](https://www.myminifactory.com/pages/for-developers).
  README and specification remain available. The search operation accepts an API
  key or OAuth; key authentication is documented as a query parameter. That would
  use the policy's narrow official-protocol exception if enabled; never put the
  key into native-search links, UI, history or errors. OAuth client-secret flows
  are not automatically appropriate for an extension without a backend.
- [Thangs content policy](https://thangs.com/resources/legal/content-policy),
  updated 30 September 2026, section “Anti-scraping”, was readable. No HTML or
  browser-context substitute was attempted.
- [Cults API overview](https://cults3d.com/en/api) and
  [GraphQL guide](https://cults3d.com/en/pages/graphql) remain the intended sources
  for confirming access. Indexed first-party content establishes external metadata
  display and Basic auth, not explicit API pricing. The guide returned 403 on direct
  retrieval. Free marketplace registration is not proof of free API access.

Tool access failures are recorded as evidence limits, not worked around or
interpreted as provider billing decisions. No authentication, CAPTCHA, anti-bot
protection, rate limit, or access control was bypassed. No personal/developer key,
logged-in session token, or third-party scraper service was used.

## Implemented behavior

`src/providers/availability.ts` records the current dispositions and encoded
native-search routes. It contains no credentials or remote execution. Results and
Settings show the reason per repository; the popup reports zero aggregation
providers and six native links. Outbound links need no host permission.

Cults was previously dispatched despite unconfirmed pricing. This follow-up
corrects that inconsistency with the explicit free-access condition: production
uses native fallback, performs no credential reads for search, and requests no API
host permissions. The original adapter and reusable local credential code/tests
remain intact. Settings allows removal of an existing Cults key, but collects no
new key while eligibility is pending. No stored key is silently deleted.

D is not Setup required: unverified integration eligibility cannot be repaired
by entering a key. Setup required applies to an **available** authenticated
integration with missing local configuration. Its core and view handling remain
tested using the retained adapter, including a Settings route.

The manifest retains only `storage` for local credential status/removal. No backend,
new dependency, paid access, new provider adapter, or credential sync was added.
Native routes are based on the investigation; interactive navigation of all six
still needs ordinary-browser verification. Access challenges must be left to
the user-opened site, never automated by tridiJump.

## Authenticated-provider test coverage

Cults is the only implemented authenticated adapter, currently excluded from
production dispatch. Its mocked tests cover the full requested contract:

1. No credentials: `setup-required`, no fetch, another provider completes.
2. Credentials present: fixed HTTPS endpoint, documented Basic header, variables,
   correct signal, omitted cookies, no redirects, no secrets in URL/body/snapshots.
3. HTTP 401/403: only Cults fails, with an actionable check-key message.
4. Remote error bodies echoing the fake secret/encoded auth never enter snapshots
   or errors; loader, network, parsing and GraphQL errors remain sanitized.
5. Remove Credentials through Settings: local key disappears and the adapter's
   next search returns to `setup-required` without another request.

Production tests also prove that even a previously saved fake key cannot bypass
the eligibility gate. All keys and fixtures in tests are fake. Existing timeout,
abort and stale-response tests remain in force. The same five contract checks are
required when any future authenticated adapter is implemented.
