# Reproducing the Firefox extension

This source archive is the complete corresponding source for the indicated
tridiJump commit. It contains no bundled API credentials.

## Requirements

- Node.js 24 or newer
- npm, as bundled with Node.js

From the extracted archive root, run:

```sh
npm ci
npm run build:firefox
```

The unpacked Firefox extension is written to `dist-firefox/`. The build uses
only TypeScript, Vite, plain HTML, and plain CSS. No minifier-specific manual
step is required.

`public/lexical-data/` contains the deterministic lookup data consumed directly
by the extension build. Its preferred-source archives are under
`lexical-source/archives/`; the converters are under `scripts/lexicon/`. Run
`npm run lexicon:build` only when intentionally regenerating that checked-in
data.

`SOURCE-ARCHIVE-MANIFEST.json` records the exact Git commit, recursive source
roots, root-file rules, exclusions, and archive statistics. Store screenshot
artwork is excluded because it is release tooling and is not used by
`npm run build:firefox`.
