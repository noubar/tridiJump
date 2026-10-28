# Privacy and network behavior

tridiJump has no backend, accounts, analytics, telemetry, advertising, affiliate
rewriting, external translation, AI service or remote executable code. Searches
go directly to enabled repositories. Their own terms and privacy policies apply.

Expanded Search generates up to three additional English/German phrase or synonym
queries entirely locally, retaining the original. Those variants are sent only
to the same enabled, configured model repositories as ordinary search requests.
No translation data goes to another service. Application history and native
fallback links retain only the original query. See [Expanded Search](docs/expanded-search.md).

## Local data

Preferences, repository choices, optional search history and provider credentials
are stored in extension `storage.local`, never synchronized or exported. History
is off by default and holds at most 50 unique original queries. Turning collection
off retains old entries; Clear search history removes them. The Results URL also
contains the query: disabling application history does not erase browser history,
session restoration data or provider-side records.

Credentials are entered in Settings, saved locally and read only by their bundled
provider adapter. Saved secrets are never prefilled or redisplayed. Replace and
Remove are available. Removing a credential locally does not revoke it at the
provider. Disabling a repository retains its credentials. Local extension storage
is not encrypted by tridiJump and is not an operating-system credential vault.
tridiJump does not issue or proxy keys and has no server receiving them.

## Production network destinations

| Destination | Purpose and data | Authentication | When contacted |
| --- | --- | --- | --- |
| `https://api.printables.com/graphql/` | Search text, limit and numeric offset | None | Enabled anonymous search and user-requested next page, via packaged worker |
| `https://cults3d.com/graphql` | Search text, batch size, optional offset, English locale | That user's Cults nickname/key in HTTP Basic | Enabled and configured search / Load more |
| `https://api.thingiverse.com/search/...` | Encoded search text, page and batch size | That user's App Token in Bearer header | Enabled and configured search / Load more |
| `https://www.myminifactory.com/api/v2/search` | Search text, page and batch size | That user's API key in the documented `key` query parameter | Enabled and configured search / Load more |
| `https://media.printables.com/...` | Cover image path returned by Printables | No application API credentials | Optional lazy cover display |
| API-returned HTTPS image hosts | Other providers' cover images | No application API credentials | Optional lazy cover display |
| Six repositories' native search pages | Original query | No application API credentials | Only when the user follows Search directly |
| Original model pages on their respective repository hosts | Model URL | No application API credentials | Only when the user opens a card |
| Official provider documentation / account setup pages | Ordinary navigation | No application API credentials | Only when the user follows a Settings/documentation link |

Native search destinations are `www.printables.com`, `makerworld.com`,
`www.thingiverse.com`, `thangs.com`, `www.myminifactory.com` and `cults3d.com`.
Model adapters restrict model links to their own expected repository hostnames.
Authenticated adapters accept safe HTTPS thumbnail URLs returned by their API;
their image hosts are not a finite bundled allowlist. Images can redirect and
ordinary browser image/cookie policy applies. tridiJump does not attach API
authentication to images. Images use no-referrer and broken images show a
placeholder. There are no remotely loaded fonts, UI libraries or script CDNs.
Destination websites may load their own resources after navigation.

All API endpoints and authentication construction are fixed in bundled code.
Requests omit browser cookies, refuse redirects and use no-store/no-referrer.
No remote registry loader exists, and metadata cannot redirect stored credentials.
No credentials enter native links, application history, application logs, errors
or exported settings. There is no settings export feature.

**MyMiniFactory exception:** its documented key authentication uses an HTTPS
request URL. That key can therefore be visible in DevTools and provider-side
request logs. Avoid sharing raw request URLs. This follows the earlier explicit
protocol exception, but does not satisfy Prompt 18's stricter no-URL-credential
criterion; see the [release audit](docs/release-audit.md). No alternative
authentication mechanism has been substituted without verification.

## Verification limits

Source, fixtures, production bundles and dependency metadata were inspected in
the release audit. This is not a guarantee against compromised browsers,
extensions, devices, providers or all possible secret encodings. Never submit
keys in issues, chat, screenshots or public traces. Use your provider's revocation
controls if a credential has been exposed.
