# Lexical source archives

The archives in `archives/` are the exact, verified preferred inputs used to
generate tridiJump's offline lexical assets. They are intentionally excluded
from the browser-extension `dist/` output.

Run `npm run lexicon:build` to verify their checksums and regenerate the compact
assets. `npm run lexicon:fetch` reacquires the pinned official artifacts and
refuses to replace an archive if its checksum differs.

The Ding archive is retained with the source distribution to make corresponding
source for the GPL-derived bilingual index available without depending only on
an upstream URL. See `THIRD_PARTY_NOTICES.md` and `licenses/`.
