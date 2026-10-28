# Synthetic provider fixtures

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
