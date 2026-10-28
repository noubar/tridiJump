# Synthetic provider fixtures

`printables/search.json` is original synthetic data for the minimal
`data.searchPrints2.items/totalCount` shape recorded in the original first-party
investigation. IDs and names are fictitious, not captured live results. It covers
ID/name/slug/likes/downloads fields plus an original fictitious `image.filePath`
for the cover-image candidate. No creator assets or live image paths were captured.
The user verified basic Chromium search/model links on 2026-10-28; cover-field
schema and media URL mapping remain pending manual verification. Mocks do not
prove image availability, and no creator/pricing/rating-scale/enum mappings are added.

All records in `myminifactory/search.json` and `thingiverse/search.json` are
original synthetic test data, not captured responses. Names, IDs and images are
fictitious; do not present them as live results. No credentials or creator assets
were captured. The existing Cults fixture has its own provenance README.

- MyMiniFactory: the official `items` / Object / Image / File / User shapes in
  https://github.com/MyMiniFactory/api-documentation/blob/master/myminifactory-api.yaml.
- Thingiverse: the developer REST search `hits` envelope and normalized fields.
  Official reference: https://www.thingiverse.com/developers/rest-api-reference.
  Current first-party v2 Swagger also documents the shared hits/name/public_url/
  thumbnail/creator/created_at/like_count fields and explicitly refers to v1
  `download_count`: https://api-staging.thingiverse.com/v2/doc.
  The adapter uses the developer App Token API, not the website's JWT/view tokens.

The combined selections and App Token compatibility still need an authenticated
live check. Mocks prove parsing/wiring/cancellation, not provider availability.

`myminifactory/pricing.json` is also original synthetic data, covering the official
v2 Object `licenses` array and License `type: store` / boolean `value` shape. It
contains explicit non-store, store and missing-store cases; no numeric price or
currency is fabricated. It is not a captured authenticated response.
