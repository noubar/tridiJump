# Third-party data notices

tridiJump is GPL-3.0-or-later software. The following bundled lexical data keeps
its own license and attribution. tridiJump converts the sources into compact,
chunked lookup indexes; it does not claim authorship of the underlying lexical
records.

## NASA 3D Resources metadata

- Project: NASA 3D Resources
- Official source: <https://github.com/nasa/NASA-3D-Resources>
- Pinned commit: `11ebb4ee043715aefbba6aeec8a61746fad67fa7`
- Snapshot date: 2026-10-31
- Usage guidance: <https://www.nasa.gov/nasa-brand-center/images-and-media/>

tridiJump bundles a derived metadata catalog containing resource titles,
classification, formats found in official file names, official resource links,
and a small number of official readme descriptions. It does not bundle NASA 3D
models, textures, thumbnails, insignia, logotypes or other model assets. Result
cards retain NASA attribution and link to the pinned official resource directory.
NASA notes that its media is generally not subject to copyright in the United
States, but third-party material and NASA identifiers can have separate
restrictions; the official usage guidance remains authoritative.

## Open English WordNet 2025 core

- Project: Open English WordNet
- Release: 2025 core, released December 31, 2025
- Official source: <https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-json.zip>
- Retrieved: 2026-10-28
- Source size: 9,986,555 bytes
- SHA-256: `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`
- Data license: Creative Commons Attribution 4.0 International
- Copyright: 2019-present, The Open English WordNet Team
- Underlying data: Princeton WordNet 3.1, Copyright 2011 Princeton University

Attribution is given to the Open English WordNet team and Princeton WordNet.
The conversion selects noun synsets from the artifact, object and shape lexical
files, retains same-synset lemmas and source sense ordering, and removes
definitions and graph relations. Hypernyms, hyponyms and other semantic graph
relations are not included.

See `licenses/Open-English-WordNet-CC-BY-4.0.txt` and
`licenses/Princeton-WordNet-License.txt`.

## Ding German-English Dictionary 1.9

- Project: Ding / TU Chemnitz German-English dictionary
- Version: 1.9, dated December 22, 2020
- Official source: <https://ftp.tu-chemnitz.de/pub/Local/urz/ding/ding-1.9.tar.gz>
- Retrieved: 2026-10-28
- Source size: 7,864,078 bytes
- SHA-256: `69a6c81fcf785a286c053a352f3201cc8671c72851615c4b707a434309b098e5`
- Copyright: 1995-2020 Frank Richter and contributors
- Data license: GNU General Public License, version 2 or later

tridiJump converts the aligned base-lemma segment of noun records into separate
German-to-English and English-to-German indexes. Equivalent lemmas remain
indexable, record/sense groups remain distinct, and inflection/example pipe
segments are not flattened into base translations. The generated Ding-derived
indexes are distributed under GPL-3.0-or-later as permitted by GPL-2.0-or-later.

The exact preferred source archive is retained under
`lexical-source/archives/ding-1.9.tar.gz` together with the converter and rebuild
instructions. See `licenses/Ding-GPL-2.0-or-later.txt`.
