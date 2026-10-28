# Pagination and credential/setup hardening

## Root cause and change

Before this change Thingiverse and MyMiniFactory hard-coded `page=1&per_page=20`.
Cults sent `creationsSearchBatch(query: ..., limit: 20)` with no continuation.
`Provider.search` returned only an array, and the orchestrator/UI had no continuation
state. Every source was consequently limited to its first requested batch. Free,
Paid, format and sort controls operated on that batch alone; the count did not say
that it described loaded models rather than a repository total.

The client still requests 20 initially to keep searches small. This is a client
choice, not a provider maximum. Optional `searchPage(query, cursor?, signal?)`
returns `{ results, nextCursor? }`; the original `search()` API remains a first-page
wrapper. Continuations are generated and validated by bundled adapters, never used
as URLs. The repository-independent orchestrator keeps cursors, in-flight requests
and results separately per provider/query stream. Each Load more action fetches at
most one additional page per eligible provider, progressively appending unique
models. It does not restart the run, clear cards or automatically crawl pages.

Counts now say `8 matching / 60 loaded` (with dot separators in the UI). Filters and
sorting apply only to loaded models. Load more remains available with restrictive
filters or zero visible matches while another page may be available. No combined
repository total is invented. Unknown price remains unknown. Thingiverse normal
models are free by bundled provider semantics; MMF uses explicit store-license
flags when returned and otherwise stays unknown. Only Cults currently supplies
numeric prices. See [provider pricing](provider-pricing.md).

## Provider mechanisms and verification limits

| Provider | Implemented mechanism | Client page size | More-page detection | Server filters used |
| --- | --- | --- | --- | --- |
| Thingiverse | Existing developer REST `/search/{encoded-query}`, numbered `page` + `per_page`; App Token unchanged | 20 | Numeric `total` when present; otherwise a full raw batch means another page may exist. Empty/short batch with no total ends it. | None; native/default ordering, local filters/sorts |
| MyMiniFactory | Official v2 `/search`, numbered `page` + `per_page`; query-key auth unchanged | 20 | Numeric `total_count`; otherwise same raw-batch fallback | None; native/default ordering, local filters/sorts |
| Cults3D | `creationsSearchBatch`, `limit` + subsequent numeric `offset`, requesting batch `total`; Basic auth unchanged | 20 | Numeric batch `total`; otherwise full raw batch fallback. Offset advances by raw records received. | None on the search field; local filters/sorts |

Raw record counts determine continuation, not the number surviving normalization
or local filters. A known total allows another request even after a short batch.
When totals are absent, a full final page may require one additional empty request
to establish exhaustion; the UI therefore says more results **may** be available.
Duplicate-only pages do not prove exhaustion and do not add duplicate cards.

### Evidence checked during this task

- [Official MyMiniFactory OpenAPI](https://github.com/MyMiniFactory/api-documentation/blob/master/myminifactory-api.yaml)
  documents search page/per_page, total_count and a default page size of 30.
  Search supports sort/order (visits/date/popularity), category and printing-related
  filters. No search price/format parameter is listed. A separate store parameter
  definition is not linked to `/search`; it is not assumed supported there.
  Printing `support` means printing supports, not price/free status.
- [Thingiverse developer reference](https://www.thingiverse.com/developers/rest-api-reference)
  was inaccessible in this environment. The existing working developer API path
  and page/per_page parameters are retained, incrementing the page instead of
  hard-coding 1. Its current maximum and search price/format/sort options could not
  be independently reverified here. No undocumented options are added, and v2
  website tokens/staging endpoints are not substituted for the user's App Token API.
- [Official Cults-linked examples by its developer](https://gist.github.com/sunny/07db54478ac030bd277c19cfe734648b)
  show search `limit`/`total` and offset pagination on other batch fields. The
  [official GraphQL reference](https://cults3d.com/en/pages/graphql) returned 403;
  unauthenticated schema verification was also unavailable. **Offset on the search
  field is inferred from the shared batch convention, not independently confirmed
  against the current schema.** It needs authenticated live verification. The
  working first-page query does not send the new offset argument; only later pages
  do. If unsupported, the page failure is visible and isolated, preserving loaded
  cards and allowing the other providers to continue. No security control was
  bypassed to retrieve the reference.

Cults examples of onlyFree/onlyPriced on `creationsBatch` do not establish those
arguments for `creationsSearchBatch`. None are guessed. UI sort changes continue
sorting loaded data; this task does not introduce request/restart behavior for sort
or filter changes. Documented MMF sorting support does not imply a universal mapping
to the existing cross-source sorts.

## Isolation, cancellation and request bounds

- Separate timeout and AbortSignal per page, preserving existing cooldowns/429
  behavior. No automatic retries. A manual Load more may retry a failed continuation;
  other providers can advance independently and existing cards remain.
- Disabled, setup-required and exhausted providers are not paginated. Settings are
  reread on Load more so a repository disabled after the initial batch is skipped.
- Every actual page request rereads its own local credentials. Removal before a
  later page produces Setup required without HTTP and stops that provider's streams.
  Configuration becomes usable again on a new explicit search without page reload.
- A new search aborts all old page requests and uses run-identity guards against
  late responses, even when an adapter ignores cancellation. A delayed settings
  read for an old Load more click cannot paginate a newer search.
- Native URLs, credentials and auth destinations remain separate; tests reject
  URL-shaped cursors before a credential-bearing request can be constructed.
- Results deduplicate per provider by native model ID and URL (ignoring fragments).
  An optional ID missing from one duplicate does not prevent URL deduplication.

The production UI now uses the [local phrase map](expanded-search.md) to feed
`expandedQueries`: original plus at most three unique extra terms. First pages for
those terms run sequentially within each provider, with immediate result insertion.
Setup required on the original skips all extra terms. Load more rotates streams,
fetching one stream page per provider per click, not every page of every variant.
Tests exercise this primitive, deduplication, the actual expansion module and the
production Results toggle path. Mocked paging is not proof of live remote schemas.

## Tests

`tests/authenticated-setup.test.ts` uses every implemented authenticated adapter
with fake credentials and mocked HTTP/extension storage. It covers missing setup,
authenticated request construction, 401/403 rejection while both real companion
adapters succeed, removal, error/log/history secrecy with populated original-query
history, conflicting metadata/fixed origins, and setup skipping with Expanded
Search enabled. No keys are requested in chat or used live by the tests.

`tests/pagination.test.ts` covers all three adapters over 20 + 20 + 5 synthetic
records, distinct continuations, raw-count handling, malformed rows/missing totals,
exhaustion, duplicate prevention (including duplicate-only pages), progressive
appending, isolated page failure/retry, disabled/setup skipping, new-search aborts,
stale responses, page timeouts/external aborts, delayed settings reads, bounded
variant dispatch, and the 60-loaded / 28-Free scenario followed by additional Free
models (Thingiverse plus Cults; MMF records without flags remain unknown). Existing cards retain their DOM identity during loading.

These are fixtures, not captured live results or proof of current API availability.
No new runtime dependency, backend, permission or logging was added.

## Manual acceptance: live verification still pending

No authorized live credentials are available in this development environment.
**None of the three providers has been proven beyond 20 live results by the agent.**
The user previously verified their first-page integrations; this task demonstrates
45/provider and 135 combined through the real adapters with synthetic HTTP data.

1. Build/load the extension, configure your own credentials in Settings and enable
   Thingiverse, MyMiniFactory and Cults3D. Search `cap` with Expanded Search off.
2. Confirm initial cards/statuses; use Load more repeatedly. Confirm requests advance
   page/offset rather than fetching page 1 again. Each source with sufficient API
   results should exceed its initial 20 unique models, and existing cards should stay.
3. Confirm exhausted sources stop requesting. If Cults rejects `offset`, record only
   the sanitized error; its search-field schema verification remains blocked. Other
   providers must continue. Never share keys or unredacted network captures.
4. Apply Free, confirm unknown-priced models are excluded, and Load more. More Free
   models can appear when further pages contain reliably free models. Free counts
   need not grow on every page; the native catalog and authenticated API may differ.
5. While Load more is pending, start a different search. Confirm old cards never
   enter the new results. Disable a provider or remove credentials and check the
   appropriate Disabled/Setup required state without blocking companions.
6. Repeat with Expanded Search on using `gear`: expect original, `Zahnrad`,
   `cogwheel`, `cog`. First pages should arrive progressively, with one continuation
   per eligible provider per Load more click. Missing-key sources should stay
   Setup required without repeated checks. Compare with expansion off (original
   only); see the [local phrase examples](expanded-search.md).

Do not treat mocked pagination, inferred Cults arguments or the toggle alone as a
completed authenticated/manual V1 acceptance run.
