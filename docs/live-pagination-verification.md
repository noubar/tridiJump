# Live multi-page pagination verification

Audit date: 2026-10-29.

This record separates bundled behavior from live provider evidence. No production
pagination code changed during this audit because no live defect was demonstrated.
The development environment had no connected Chromium session, and provider
credentials were not available to the audit. Stored browser data was not inspected.

Evidence labels mean:

- **DOCUMENTED**: supported by current provider documentation.
- **OBSERVED LIVE**: observed against the provider in a normal Chromium extension.
- **VERIFIED BY TEST ONLY**: exercised through the production adapter with mocked
  transport and fake credentials.
- **INFERRED**: implied by related provider material or the current implementation,
  but not established for the exact live search operation.
- **MANUAL VERIFICATION REQUIRED**: live evidence is still needed.

## Current provider contracts

| Provider | Endpoint and mechanism | Initial cursor | Continuation formula | Limit | Total | Exhaustion | Stable dedupe identity | Evidence |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| Printables | Fixed worker POST to `https://api.printables.com/graphql/`; `searchPrints2(query, limit, offset)` | offset `0` | `offset + raw items.length` | 20 | required `totalCount` | raw count is zero, or next raw offset reaches total | API `id`, then canonical model URL | Multi-page behavior was **OBSERVED LIVE** in the user's Chromium acceptance. Query shape and 0/20/40 progression are also covered by tests; ordering remains undocumented. |
| Thingiverse | GET `https://api.thingiverse.com/search/{query}` with `page` and `per_page`; Bearer App Token | page `1` | `page + 1` after a non-final raw batch | 20 | optional numeric `total` | raw count zero; with total, `(page - 1) * 20 + raw count >= total`; without total, raw count below 20 | API `id`, then `public_url` | Multi-page behavior was **OBSERVED LIVE** in the user's Chromium acceptance and is covered by adapter tests. The exact contract was not re-established from accessible official documentation. |
| MyMiniFactory | GET `https://www.myminifactory.com/api/v2/search` with `q`, `page`, `per_page` and existing query-key authentication | page `1` | `page + 1` after a non-final raw batch | 20 | documented `total_count` | raw count zero; with total, `(page - 1) * 20 + raw count >= total`; without total, raw count below 20 | API `id`, then canonical model URL | Page/per_page and total_count are **DOCUMENTED** by the official OpenAPI and 1/2/3 behavior is covered by tests. The user **OBSERVED LIVE** the Results count advancing 19 → 39 → 59 for `car`; request-level evidence remains pending. |
| Cults3D | POST `https://cults3d.com/graphql`; first `creationsSearchBatch(query, limit)`, continuation adds numeric `offset` | offset `0` | current adapter uses `offset + raw results.length` | 20 | search example documents `total` | current adapter ends on zero raw results, or when next raw offset reaches total; otherwise a short batch without total ends it | canonical creation URL; no model ID is requested | Search limit/total are shown in provider-linked examples. The user **OBSERVED LIVE** the Results count advancing 19 → 39 → 59 for `car`. Exact request offsets and raw-count semantics remain unobserved. |

No provider ordering guarantee was found for the exact operations used here.
Best Match therefore continues to preserve arrival/provider-native order without
claiming a stable universal ranking.

## Live results

### Printables

**OBSERVED LIVE — USER MANUAL ACCEPTANCE, 2026-10-29.** The user confirmed that
Printables loaded later results correctly through repeated Load more actions in
Chromium. Exact per-page counts, IDs, `totalCount` and offsets were not retained in
the report. Automated adapter coverage separately proves the bundled 0/20/40
request progression, raw-count continuation and exhaustion calculations.

### Thingiverse

**OBSERVED LIVE — USER MANUAL ACCEPTANCE, 2026-10-29.** The user confirmed that
Thingiverse loaded later results correctly through repeated Load more actions with
their locally configured credential. Exact per-page counts, IDs, totals and page
parameters were not retained. No secret was requested, read or logged.

### MyMiniFactory

**OBSERVED LIVE AT THE RESULTS UI — USER CHECKPOINT, 2026-10-29.** With `car`,
Expanded Search off and all repositories enabled, only MyMiniFactory supplied
aggregated cards. The loaded count was 19 initially, 39 after Load more #1 and 59
after Load more #2. The increments were therefore +20 and +20. Since the
orchestrator increments this count only after provider-local ID/URL deduplication,
the checkpoint establishes 59 cumulative unique displayed results and proves that
later MyMiniFactory results append instead of replacing the first batch.

This checkpoint does not expose or establish the raw API item count, requested
page values, `total_count`, first/last IDs, cross-page duplicate IDs before local
deduplication, or exhaustion. Those request-level facts still require a sanitized
Network inspection. The separate query-string credential-policy blocker is
unchanged by this audit.

### Cults3D

**OBSERVED LIVE AT THE RESULTS UI — USER CHECKPOINT, 2026-10-29.** With `car` and
Expanded Search off, the loaded count was 19 initially, 39 after Load more #1 and
59 after Load more #2. Both clicks therefore appended 20 new unique displayed
Cults3D cards; neither replaced nor completely repeated the first batch.

This proves that the live search accepts the continuation requests generated by
the current adapter and returns useful later results. Production code derives
each continuation from the raw response length, so the successful distinct later
batches establish that raw-count continuation is operationally compatible with
the tested Cults3D search. Exact requested offsets, raw counts, `total`, first/last
creation URLs and final exhaustion were not retained as diagnostic evidence.

## Automated evidence

The production adapters are tested with fixture-shaped responses and fake
credentials:

- Printables requests offsets 0, 20 and 40 and normalizes 20 + 20 + 5 distinct
  records. A malformed row yields 19 cards while the next cursor remains 20.
- Thingiverse, MyMiniFactory and Cults3D request positions 0, 20 and 40 through
  their actual adapter code and normalize 20 + 20 + 5 distinct records. Their
  raw-count tests prove that one rejected row does not shift continuation.
- The orchestrator retains one cursor per provider and query variant, appends
  progressive results, ignores duplicate-only pages without declaring exhaustion,
  suppresses stale pages after a new search, and isolates continuation failure.
- Results-page tests keep pagination independent from repository, price and format
  filters. Loaded counts, not visible filtered counts, remain the UI basis.
- Setup-required and disabled providers do not receive continuation requests.

These checks are credible regression coverage but are not live provider evidence.

## Manual Chromium acceptance

Use a production build loaded unpacked from `dist`. Do not share credentials,
Authorization headers, cookies, complete HAR files, or unredacted MyMiniFactory
request URLs.

### Ordinary pagination run

1. In Settings, enable Printables. Configure and enable Thingiverse,
   MyMiniFactory and Cults3D only with your own provider-issued credentials.
   Leave Expanded Search **off**.
2. Search `car`. Wait until every enabled source has left Searching. Record the
   grid's loaded count and each provider status. Save a screenshot of the grid and
   statuses; credentials must not be visible.
3. Record the first and last three model URLs for each source. Their numeric IDs or
   canonical URLs are the stable comparison keys. Record provider totals only when
   the response supplies them.
4. Click **Load more** once, wait for completion, and record the new loaded count,
   source statuses, first/last keys for the new batch and cumulative unique keys.
5. Click **Load more** a second time and repeat. A provider with at least 60 matches
   should show three later, mostly distinct batches. An isolated moving-index
   duplicate can occur; identical pages or repeated cursors are a failure.
6. For Printables, inspect the extension service worker from `chrome://extensions`
   and record only the GraphQL variables (`query`, `limit`, `offset`), raw item
   count, normalized card count, `totalCount` and next/exhausted state. Expected
   offsets from the current client are 0, then raw-count continuation (normally 20
   and 40); verify rather than assume them.
7. For Thingiverse, record page values and counts without capturing the
   Authorization header. For MyMiniFactory, redact the entire `key` parameter
   before any screenshot or note. For Cults3D, record variables and counts without
   capturing the Basic Authorization header or GraphQL error text that might echo
   request data.

For each page, report: query; requested page/offset; limit; raw count; normalized
count; first/last stable keys; total; next cursor; exhausted; duplicates against
each earlier page; cumulative unique normalized count.

### Results-page behavior

1. Confirm existing cards remain and new cards append after both clicks. Exhausted
   providers must stop requesting while other providers continue with independent
   page/offset values.
2. Enable **Free** after the first batch and click Load more. The request cursor must
   continue from provider state, even if fewer than 20 cards are visible. Repeat
   with a repository filter. Filters may change visible counts, never cursors.
3. Start `car`, click Load more, then immediately search `phone`. After all requests
   settle, no `car` cards or continuation state may appear in the `phone` run.
4. Turn Expanded Search on and search `gear`. Record the displayed generated terms.
   Initial variant requests are sequential per provider. On each Load more click,
   record which provider/query stream advanced; each stream must reuse only its own
   cursor. Because the orchestrator rotates up to four query streams, use enough
   clicks to revisit a stream rather than assuming the second click means page 3 of
   the original term.

Send back the redacted table plus screenshots of initial, Load more #1 and Load
more #2 states. For Cults3D, include sanitized query variables and raw/normalized
counts for offsets 0 and both continuations. That evidence is required to decide
whether the current raw-count formula is correct.

## Release status

The pagination release blocker is **cleared by manual Chromium acceptance on
2026-10-29**. The user confirmed successful later-page behavior for all four
aggregated providers. MyMiniFactory and Cults3D supplied the recorded 19 → 39 → 59
loaded-count sequence; Printables and Thingiverse were confirmed without retained
per-page diagnostics. Automated coverage supplies the complementary evidence for
independent provider/query cursors, raw-count continuation, deduplication,
exhaustion, stale suppression, filter independence and Expanded Search isolation.

The missing per-request diagnostic tables are an evidence-detail limitation, not
an observed release defect. No production pagination change was required.
