# V1 Expanded Search

Expanded Search uses a small bundled English/German phrase map and search
synonyms. It runs locally with no AI, translation service, new permission or
external dependency. It is model-discovery assistance, not general translation.

## Algorithm

`src/synonyms/expand-query.ts` normalizes input with the existing safe query
rules. A blank input returns no queries. Otherwise the original is first.
Matching is case-insensitive and Unicode-aware, on whole words/phrases; multiple
spaces in a known phrase are accepted. For matching and deduplication, canonical
Unicode equivalents are treated alike. The original retains its entered casing.

Choose one longest matching phrase; ties use the earliest occurrence. Replace
that phrase with alternatives from its group, preserving surrounding text and
product-name casing. Never combine substitutions from several words/groups.
Omit duplicate alternatives case-insensitively, whitespace/Unicode equivalents,
and replacements exceeding the existing 200-code-unit input bound. Stop after
three additional queries (four total). Unknown queries remain original-only.

The modest map has 21 groups, including explicit phone-holder, wall-mount,
headphone-stand and plant-pot phrases plus conservative generic discovery terms.
Some alternatives broaden meaning; they are not universal translation assertions.
Proper names such as Raspberry Pi, ESP32, Arduino, iPhone, Samsung and Bambu Lab
are preserved when a surrounding generic term is replaced. There is no stemming,
arbitrary compound splitting, dictionary download or combinatorial word product.

## Required examples

| Input | Ordered queries |
| --- | --- |
| Zahnrad | Zahnrad; gear; cogwheel; cog |
| gear | gear; Zahnrad; cogwheel; cog |
| phone holder | phone holder; Handyhalter; smartphone holder; phone mount |
| Handyhalter | Handyhalter; phone holder; smartphone holder; phone mount |
| Raspberry Pi Gehäuse | Raspberry Pi Gehäuse; Raspberry Pi case; Raspberry Pi enclosure; Raspberry Pi housing |
| raspberry pi case | raspberry pi case; raspberry pi Gehäuse; raspberry pi enclosure; raspberry pi housing |

Mixed text such as `ESP32 Gehäuse holder` replaces only `Gehäuse`; the other word
and product name stay intact. This intentionally avoids trying to translate every
token. Unknown `xyzzy` has no additional queries.

## Production dispatch and paging

Results `runSearch()` captures the checkbox and supplies only the generated extra
queries to the existing view's `expandedQueries` argument. When off, it supplies
none. Popup passes the existing URL flag; Settings controls the default for new
entry pages. An explicit query URL/toggle remains authoritative.

The same orchestrator starts providers independently. Within each provider it
searches the original first, then the remaining variant first pages sequentially,
inserting results after each completion. No second runner or provider-specific
dispatch exists. Missing credentials stop that provider after its one setup check;
there are no expanded-term HTTP attempts or repeated missing-key checks. Disabled
providers do not execute or read credentials. A new explicit search can recheck
credentials saved in Settings. A failure/timeout stops further initial variants
for that provider while other providers continue.

Each variant retains its own continuation. Load more remains user-driven and
requests at most one continuation per eligible provider per click, rotating among
streams. No continuation pages load automatically. Starting a new search aborts
the old run and invalidates every old variant and cursor, even if an old response
arrives late. Provider/model-ID and URL deduplication keeps a repeated model to one
card per provider. The existing optional `ModelResult.query` keeps its first
matched-query provenance; no separate matchedQuery field is added.

Native fallbacks use only the original query; no variant tabs open automatically.
Application history also stores only the original query. Resulting variants are
sent only to the existing enabled/configured repositories as normal searches;
these requests can be up to four times the initial per-provider request count.
Existing timeouts, rate-limit isolation and provider origins are unchanged.

## Verification and limitations

Tests exercise the actual expansion module and Results entry point, the real
Printables adapter/worker handler through the mocked extension channel, and the
existing runner. Coverage includes all six examples, casing/spacing/Unicode,
unknown and mixed input, product names, length/cap/dedup bounds, off/default/on,
progressive cards, setup/disable behavior, original-only history/native links,
independent user-driven cursors, and stale variant responses after a new search.
HTTP responses remain synthetic: these tests do not establish live provider
pagination schemas. Existing live-pagination and credential-policy release gates
from the [historical audit](release-audit.md) remain separate. Browser acceptance
of the newly wired Expanded Search remains pending.

Validation: `npm test` passed **389 tests across 26 files** (37 new focused
expansion/production-path tests). `npm run typecheck`, `npm run build` and
`git diff --check` passed. The generated manifest is unchanged, all 27 inspected
local references resolve, and the stale unavailable-expansion wording is absent
from production output. No provider protocol, dependency or permission changed.
