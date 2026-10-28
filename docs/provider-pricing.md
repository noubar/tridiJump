# Free/Paid filter investigation and fix

The generic filter was excluding unknown metadata as intended; two adapters lost
useful provider semantics before the filter ran. Cults did not have that defect.

## Data path

1. Existing authenticated adapters read API search envelopes: Thingiverse `hits`,
   MyMiniFactory `items`, Cults `data.creationsSearchBatch.results`.
2. Normalizers produce optional `ModelResult.isFree`/`price` metadata. Missing
   metadata does not remove a model from the normalized batch.
3. The credential-echo guard preserves safe normalized results; the orchestrator
   tags queries, deduplicates and appends them to the current result set without
   replacing price fields or inferring a price.
4. `filterResults` uses generic `priceKind`: only boolean true/false establishes a
   free/paid flag; otherwise a valid numeric amount/currency can establish it.
   All retains unknowns; Free/Paid exclude them without deleting stored results.
5. Cards use `priceLabel` from the same semantics. Free is FREE; known paid without
   amount is PAID; numeric price retains its currency; unknown has no price badge.

No provider-name condition was added to the filter or UI, and no new credential
logic, requests per result or server-side filtering was introduced.

## Thingiverse

The existing fixture has no numeric price/free field. The adapter previously
omitted both isFree and price, so all its models became unknown and disappeared
from both filtered views. The current [Thingiverse team's statement](https://forum.thingiverse.com/t/thingiverse-subscription-ad-free-experience-your-ideas-wanted/96/6)
confirms free downloads and distinguishes optional subscriptions/creator services
from paid file downloads. Normal models now get `isFree: true` within that adapter.
No numeric zero or currency is fabricated. All and Free retain them; Paid excludes
them. This says nothing about commercial-use or redistribution permissions.

## MyMiniFactory

The old fixture has no pricing flags. The [official v2 schema](https://github.com/MyMiniFactory/api-documentation/blob/master/myminifactory-api.yaml)
declares no numeric price/free field, but Object includes a `licenses` array and
License includes `type: store` plus boolean `value`; store denotes a paid object.
The adapter ignored that array. It now maps explicit store=true to isFree=false
and store=false to isFree=true. Absent, malformed or conflicting flags remain
unknown. Other license permissions, printing support and descriptive strings do
not establish a price. Amount/currency remain unavailable. This fixes ignored
flags, not API responses that omit them. There is no per-model enrichment request.

`tests/fixtures/myminifactory/pricing.json` adds synthetic free, paid and unknown
examples of that documented shape. It is not a capture of this user's live search.
No current authenticated MMF payload was available here; if it omits the flags,
those models appropriately remain visible only under All. The UI now names sources
and counts loaded models with unknown price status so the limitation is explicit.

## Cults3D

The existing fixture reports `price.cents` 0 and 325. The adapter already produced
isFree true/false and amounts 0/3.25 in the requested EUR currency. That normalization
and API query remain unchanged. Missing/invalid cents still mean unknown. The new
regressions check both filtered states, not only visibility under All.

## Regression evidence

Before the fix, new tests failed on Thingiverse free classification, ignored MMF
store flags, the six-model mixed set, and rendered Free cards: only Cults remained.
After the fix:

- Thingiverse fixture model: All/Free visible, Paid excluded, no fabricated price.
- MMF fixture: known free visible under All/Free, paid under All/Paid, unknown only
  under All. Invalid/conflicting flags and unrelated metadata never become free.
- Cults fixture: free/paid cents map correctly; missing price remains unknown.
- Mixed set: six under All, three under Free, two under Paid; one MMF unknown.
- Real adapter requests through orchestration/store/cards: same counts and labels;
  no extra HTTP request when changing filters, and the unknown MMF count is shown.
- Pagination with Free selected appends additional qualifying MMF cards, preserves
  existing nodes, excludes unknowns and never refetches page 1.
- The existing 60-loaded regression now correctly has 28 Free (20 Thingiverse +
  8 Cults); another page yields 56 Free out of 120 loaded. Its MMF records lack
  store flags, remain unknown and are excluded. Load more stays available.
- Malformed runtime isFree values are ignored rather than coerced to free/paid.

Tests are in `tests/provider-pricing.test.ts`, `tests/result-options.test.ts`,
`tests/authenticated-providers.test.ts` and `tests/pagination.test.ts`.

## Manual verification status

The Browser skill runtime reported no browser available; discovery returned an
empty list. No authenticated live credentials or captured production responses
were used. Automated DOM interaction exercised All, Free and Paid, including the
real adapter-to-card path and pagination. **Manual browser/live verification was
not completed**, and this report does not claim that all live MMF results now
expose price information.

To verify with your configured extension:

1. Search `cap` under All and identify results from each source.
2. Select Free: Thingiverse must remain, as must known-free Cults/MMF models.
3. Select Paid: Thingiverse must disappear without failure; paid Cults/MMF models
   with known flags/prices remain. MMF without flags remains excluded and counted
   as price unavailable. Paid MMF cards can say PAID without a monetary amount.
4. Return to All: unknown models reappear. Repeat Free and Load more; existing cards
   should remain and additional qualifying results can appear beyond page 1.
5. Native catalog contents and API contents can differ. Check representative MMF
   entries with returned flags against their original pages; do not share keys or
   unredacted request URLs. Existing Cults offset/live pagination verification limits
   from `docs/pagination.md` remain unchanged by this price fix.
