# Smithsonian 3D provider

Updated 2026-10-31.

## Mechanism

tridiJump searches Smithsonian's official Open Access API at the fixed bundled
endpoint `https://api.si.edu/openaccess/api/v1.0/search`. It adds the fixed
`online_media_type:"3D Models"` filter and normalizes only rows containing an
official `3d_voyager` media record. One API request retrieves each 20-object page;
there are no per-card enrichment or model-file requests.

This provider is tagged `specialist`: it searches museum and cultural-heritage 3D
objects, not a general printable-model catalog. The tier is descriptive metadata;
it does not give the adapter special orchestration behavior.

The separate anonymous Smithsonian 3D file-search endpoint was investigated but
is not used. Its rows describe downloadable files and do not provide the complete
object-page, preview, rights and attribution data needed for safe tridiJump cards.
tridiJump does not turn those file URLs into cards or download model files.

## Setup

The Open Access API requires an API key. Request your own key through the official
[Smithsonian developer tools page](https://www.si.edu/openaccess/devtools), which
links to [api.data.gov signup](https://api.data.gov/signup/). API-key signup is
available to ordinary users without an API-access subscription. Provider terms,
availability and quotas can change; the official pages remain authoritative.

In tridiJump Settings, open **Smithsonian 3D**, enter the API key, and choose
**Save credentials**, then enable its repository switch. Smithsonian starts
disabled on a new installation because it cannot search before setup. Missing
configuration is `setup-required`, not a failure.
The native **Search directly** link remains available.

The key stays in extension `storage.local`, is never redisplayed, and can be
replaced or removed. tridiJump has no server receiving it. Local extension storage
is not encrypted by tridiJump and is not an operating-system credential vault.
Smithsonian's documented protocol requires the key in the HTTPS `api_key` query
parameter. Consequently it can appear in browser network diagnostics and the
provider's request logs. The destination and parameter are fixed in bundled code;
do not share authenticated request URLs.

## Normalization and rights

Required card values come from the Open Access row title and official 3D Voyager
media URL. When explicitly present, the adapter preserves the Voyager ID,
thumbnail, creator/maker label, summary, Smithsonian unit/museum, collection,
usage/access statement, and recognized resource formats. It never invents price,
rating, downloads, creation date, popularity or a creator from unrelated roles.

Only an explicit `CC0` access value sets `isFree: true`. Restricted or missing
rights remain unknown and are not labeled FREE. Users must follow the rights and
usage information attached to the Smithsonian object. Smithsonian names, logos
and trademarks are not treated as CC0.

## Verification

The query filter, response shape, pagination fields and representative metadata
were checked against live official API responses during development. Automated
coverage uses synthetic fixtures and fake credentials. A credentialed repeat is
opt-in:

```powershell
$env:TRIDIJUMP_SMITHSONIAN_API_KEY = '<your own key>'
npm run test:live:smithsonian
Remove-Item Env:TRIDIJUMP_SMITHSONIAN_API_KEY
```

The test output omits the key and authenticated URL. It is skipped when the
environment variable is absent. Never put the key in source, Git, chat or test
fixtures.

The Open Access API and Smithsonian 3D API describe themselves as evolving APIs;
field names, media shapes, quotas or availability may change. Such changes should
fail only this adapter and leave other repositories working.
