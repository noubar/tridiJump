# NASA 3D local catalog

Updated 2026-10-31.

## Runtime behavior

NASA 3D is a credential-free specialist provider. It searches a packaged JSON
catalog in the extension and makes no runtime request. Results participate in
the normal orchestrator, Expanded Search, repository filtering, cancellation,
deduplication and 20-result pagination. Opening a result navigates to the
corresponding directory in NASA's official 3D Resources repository.

NASA 3D starts disabled by default. Enable it under **Settings → Repositories**
to include it in subsequent searches; no credentials or extension reload are
required.

No NASA models, model files, textures or thumbnails are bundled or downloaded by
tridiJump. Cards deliberately use the normal missing-thumbnail presentation.

## Official source and pin

- NASA Science hub: <https://science.nasa.gov/3d-resources/>
- Official repository: <https://github.com/nasa/NASA-3D-Resources>
- Pinned commit: `11ebb4ee043715aefbba6aeec8a61746fad67fa7`
- Snapshot date: 2026-10-31
- Source snapshot SHA-256: `2994cff5d62aa83c97141b8a67eb194975eb976314a0898706edbf482cf5af68`
- Catalog schema: 1; source records: 333; normalized records: 333
- NASA media guidance: <https://www.nasa.gov/nasa-brand-center/images-and-media/>

The checked-in `providers/nasa/source.json` records the official repository tree
metadata at that exact commit. `src/providers/catalogs/nasa.json` is the smaller
runtime catalog deterministically derived from it. The source snapshot is kept in
the Firefox source archive so an AMO reviewer can reproduce the catalog without
network access.

## Mapping rules

Each direct child directory of official `3D Models` or `3D Printing` is one
catalog record. Directory names become titles. Recognized file extensions become
formats; `vsp3` is normalized to `openvsp`. A small number of `readme.txt` files
provide optional descriptions. Canonical URLs point to the pinned directory in
the official NASA repository.

Printability is intentionally conservative:

- `3D Printing` records have `is3DPrintable: true`.
- `3D Models` records omit printability; they are not marked false.

The catalog does not infer creator, creation date, rating, popularity, download
count or thumbnails. NASA's resource hub states that these assets are free to
download and use, so normalized results set `isFree: true` while retaining the
NASA media-guidance label and attribution. Official guidance and any
resource-specific third-party notice remain authoritative.

## Refresh and reproducibility

Ordinary development and release builds do not access GitHub. Rebuild the runtime
catalog from the checked-in snapshot with:

```sh
npm run catalog:nasa:build
```

Maintainers can intentionally refresh official metadata with:

```sh
npm run catalog:nasa:refresh
```

The refresh command still requests the bundled commit constant; updating to a
new NASA revision therefore requires a reviewed source change. It rejects
truncated tree responses, empty resources, duplicate IDs, oversized output,
malformed JSON and recognizable credential material before replacing checked-in
files. Run the normal test/typecheck/browser-build suite after any intentional
pin update and review NASA's current usage guidance.

