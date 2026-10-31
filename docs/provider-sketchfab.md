# Sketchfab provider

Updated 2026-10-31. This is a V2 integration record; it does not amend the frozen
V1.0.0 release notes.

## Mechanism

tridiJump uses Sketchfab's official public
[Data API v3](https://sketchfab.com/developers/data-api/v3) model search:

`GET https://api.sketchfab.com/v3/search?type=models&q=<query>`

Public model search currently works without credentials. tridiJump sends no
Authorization header, cookies, OAuth token or account identifier. The adapter is
packaged TypeScript and does not scrape pages, invoke model downloads or load
remote executable code. Its only added host permission is
`https://api.sketchfab.com/*`.

## Live verification

On 2026-10-31 anonymous requests for `benchy`, `car`, `gear` and `holder` returned
HTTP 200 with 24 records and continuation metadata. A reconstructed page-two
request using only the fixed endpoint and opaque cursor also returned HTTP 200.
Automated tests use fictional sanitized fixtures; an optional anonymous smoke
test is available as `npm run test:live:sketchfab`.

The adapter never follows a response-provided pagination URL. It validates the
returned origin, path, query and cursor, retains only the opaque cursor, and
reconstructs the next request against the bundled endpoint. Remote response data
therefore cannot change the request destination.

## Normalization

| Sketchfab | tridiJump |
| --- | --- |
| `uid` | `id` |
| `name` | `title` |
| `viewerUrl` | canonical model `url` after host/path validation |
| `thumbnails.images` | deterministic public `thumbnail` from `media.sketchfab.com` |
| `user.username` | `creator` |
| `publishedAt` | `publishedAt` |
| `likeCount` | provider-local `popularity` |
| `viewCount` | `views` |
| `commentCount` | `comments` |
| `isDownloadable` | `isDownloadable` |
| `license.label` / `license.uid` | `license` |

Missing or malformed optional data stays absent. `isDownloadable` does not mean
free, purchasable, printable or available in a known file format. The adapter
therefore does not invent `isFree`, price, formats, downloads or rating. Best
Match preserves API order. Latest and Popularity are available only when enough
reported values exist; cross-provider popularity remains disabled.

## Pagination, failures and limits

Sketchfab's opaque `cursors.next` drives Load more. One API request is made per
provider/query page. Core cancellation, timeouts, stale-result rejection,
deduplication and provider failure isolation apply unchanged. HTTP 400, 401/403,
404, 429 and server failures get provider-local messages. A 429 starts a local
cooldown using `Retry-After` when available.

The API schema, fields, availability, terms and limits can change. Sketchfab does
not document a fixed anonymous quota in the sources reviewed, so tridiJump does
not claim one. Relevant official sources are the
[API reference](https://docs.sketchfab.com/data-api/v3/swagger.json),
[developer guidelines](https://sketchfab.com/developers/guidelines), and
[API agreement](https://sketchfab.com/developers/terms). Sketchfab's own terms
and privacy policy govern requests and model-page navigation.
