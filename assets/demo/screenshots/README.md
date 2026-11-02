# Store screenshot artwork

The PNGs in this directory are generated, copyright-safe Benchy demonstration
artwork supplied for tridiJump store screenshots. They are not screenshots from
provider websites and do not depict real listings.

Capture mode discovers repositories from the rendered production page. For each
repository that supports unified-grid results, it selects `Demo-<repository>.png`
after punctuation-insensitive name matching; repositories without matching
artwork use `Demo-Neutral-Benchys.png`. Direct-search-only repositories never
receive mock result cards and are shown only as native-search links.
The screenshot server blocks remote traffic. These assets are capture inputs
only: Vite does not copy them into the extension build or release package.
