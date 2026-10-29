# V1 Expanded Search

Expanded Search uses bundled offline lexical data to find a small number of
related English and German search terms. Open English WordNet 2025 core supplies
conservative English noun synonyms. The TU Chemnitz Ding 1.9 dictionary supplies
German-to-English and English-to-German noun translations.

It always searches the original query first and adds at most three alternatives.
It does not contact an AI, translation API, dictionary website or tridiJump
server. Unknown input can correctly remain original-only.

## Lexical pipeline

`src/synonyms/` implements this bounded pipeline:

1. Preserve the safely trimmed original query exactly.
2. Normalize Unicode, whitespace, case, apostrophes and hyphens only for lookup.
3. Protect a small set of relevant product/platform spans and alphanumeric IDs.
4. Look up exact Ding noun translations in the likely language direction.
5. Look up English synonyms from the first suitable concrete OEWN noun sense.
6. For an unsupported German compound, find one evidence-backed two-part split,
   including a conservative linking element where necessary.
7. Reconstruct one-token phrases or a bounded bilingual phrase without a
   Cartesian product.
8. Rank source-backed candidates, remove normalized duplicates and return the
   original plus at most three variants.

OEWN extraction includes same-synset lemmas from its noun artifact, object and
shape files. It does not include hypernyms, hyponyms, meronyms, antonyms or other
graph relations. For example, `car` can yield `auto` and `automobile`, while
`vehicle` is not introduced as a hypernym.

Ding records remain grouped by aligned base-lemma segment. Equivalent source
lemmas are all indexed, so `Handy` is found inside its grouped
`Mobiltelefon; Funktelefon; Handy` record. Plural/example pipe segments are not
flattened into base meanings.

The only manual domain knowledge is ranking and preservation metadata. It does
not supply replacement phrases. English product-head ranking contains: box,
bracket, case, casing, clip, cover, enclosure, handle, headphone, holder, hook,
housing, lid, mount, phone, rack, shell, stand, tool and wheel. German ranking
contains: Aufbewahrung, Befestigung, Box, Fassung, Gehäuse, Halter, Halterung,
Kiste, Ständer, Telefon, Wand and Werkzeug. Product span protection contains:
Raspberry Pi, Arduino, ESP32, Bambu and Prusa. These lists only rank or preserve
terms already present in the real sources.

## German compounds and phrases

Compound decomposition tries the exact Ding record first, then considers one
two-part right-headed split whose components both have Ding entries. It permits
the linking elements `s`, `es`, `n`, `en`, `er` and `e` only at a boundary where
both resulting components are known. It selects one best split and combines the
best modifier with at most three head translations.

This produces source-backed searches such as `Werkzeughalter` → `tool holder`,
`Aufbewahrungsbox` → `storage box`, and `Kopfhörerständer` → `headphone stand`.
The same generic algorithm handles compounds absent from the product-protection
and ranking lists.

Phrase reconstruction changes one head component at a time. Protected spans are
left intact, so `Raspberry Pi Gehäuse` can produce `Raspberry Pi case`. A bounded
whole-phrase bilingual reconstruction is allowed, but recursive
translation→synonym→translation expansion is not. A German exact translation may
receive one corroborated same-synset English enrichment step; expansion ends
there.

This is search assistance rather than full translation or perfect word-sense
disambiguation. Some dictionary alternatives can be uncommon, and not every
German compound has an unambiguous split.

## Generated assets and maintainer workflow

The verified upstream archives live in `lexical-source/archives/` and are never
copied into the browser distribution. Run:

```sh
npm run lexicon:build
```

The command verifies both pinned SHA-256 checksums, parses the sources, creates
64 deterministic buckets for each index and reports counts and byte sizes. The
normal `npm run build` performs no lexical network request and consumes the
approved generated assets already under `public/lexical-data/`.

Maintainers can explicitly reacquire the pinned sources with:

```sh
npm run lexicon:fetch
```

That command refuses to install an artifact whose checksum differs. Upstream
source, version, retrieval date, checksum, converter version and output format
are recorded in `public/lexical-data/provenance.json`. Licensing and attribution
are in `THIRD_PARTY_NOTICES.md` and `licenses/`.

At runtime, the results page hashes a normalized lookup key into one of 16
packaged JSON buckets and fetches only needed extension-local chunks. Loaded
chunks are cached for that page. Invalid or missing data fails closed to fewer or
no variants. Expanded Search off does not invoke the lexical loader.

## Provider dispatch and paging

The existing orchestrator searches each enabled provider independently. Within
one provider it searches the original and then remaining variant first pages
sequentially, appending results progressively. Setup-required stops that provider
after one credential check, so expanded variants never multiply its requests.
Disabled providers do not execute. MakerWorld and Thangs remain direct-search
fallbacks and receive only the original query in their links.

Each variant retains independent continuation state. Load more remains
user-driven, result URL/ID deduplication still applies, and `ModelResult.query`
records the first matching query. Starting another search cancels the old run and
suppresses late variant results. Search history and native fallbacks retain only
the original query.

## Limits

- Original query plus at most three alternatives.
- Concrete same-synset English nouns only.
- One primary lexical lookup and at most one corroborated enrichment step.
- One German compound split with at most two components in V1.
- No sentence translation, remote fallback or guarantee for every word.
- No new browser permission or external lexical network destination.
