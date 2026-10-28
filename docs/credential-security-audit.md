# Credential security audit

Date: 2026-10-28. Scope: current application, tests, fixtures, documentation,
generated extension, local Git configuration, all local Git blobs and available
history. The starting checkout was clean, at `f31c133`.

## Findings

1. **No confirmed real credential found in the repository or local Git objects.**
   Scanned 17 commits across all available refs and all 248 local Git blobs,
   including unreachable objects. Keyword review covered API keys, tokens,
   Authorization, Basic, Bearer, secret and password. Additional patterns checked
   private keys, recognizable access-token prefixes/JWTs, and quoted credential
   assignments. The 43 unique fake-literal matches were synthetic test values;
   remaining candidates were invalid-test nicknames, a placeholder key, an
   unrelated fixture username and ternary string literals. The short `key` test
   placeholder is now explicitly named FAKE. Local Git config had no suspicious
   credential-bearing remote URL or authentication extra-header entry.
   This is an evidence-based scan, not proof that every possible secret format
   could be detected. It covers locally available objects, not absent remote
   branches, deleted server objects, issue attachments, CI logs or user profiles.
2. **Response-echo path found and fixed.** Successful API data previously could
   contain the supplied secret in a model URL, thumbnail or title. Existing URL
   and HTML safety checks did not prevent that disclosure. All three adapters now
   guard normalized results before returning them: raw and URL-encoded secrets
   (plus Cults Basic payload) trigger a fixed error, with no partial results or
   image request. This finding was demonstrated with synthetic malicious data;
   it is not evidence that an actual provider leaked a real credential.
3. **MyMiniFactory query-key authentication is an intentional exposure exception.**
   The existing official protocol uses `key` on the HTTPS API request URL. The key
   is therefore observable in browser network diagnostics/HARs and potentially
   provider/proxy/access logs or browser-generated network error messages.
   `cache: no-store` does not remove this exposure. tridiJump does not put that URL
   into navigation, model cards, fallback links or history. No API protocol was
   changed by this audit.

## Lifecycle by provider

Every input is created from packaged field definitions in
`src/settings/provider-credentials.ts`. Secret inputs use password type, no
`name`/`value`/data attribute containing the secret, autocomplete off and spellcheck
false. Submit prevents native navigation, whitelists declared values, clears inputs
even if saving fails, and shows fixed masks. Replacement starts blank; cancel
clears unsaved values. Cults nickname is intentionally shown as non-secret Settings
text but is never merged into provider metadata.

| Provider | User fields / storage key | Retrieval and authenticated request | Removal |
| --- | --- | --- | --- |
| Cults3D | nickname + apiKey / `tridijump.credentials.cults3d` | Reads its own fields for each search; POST `https://cults3d.com/graphql`, `Authorization: Basic base64(nickname:key)` | Remove deletes only this key; next enabled search is setup-required |
| MyMiniFactory | apiKey / `tridijump.credentials.myminifactory` | Reads its own fields for each search; GET `https://www.myminifactory.com/api/v2/search`, documented `key` query parameter | Same behavior, scoped to MyMiniFactory |
| Thingiverse | appToken / `tridijump.credentials.thingiverse` | Reads its own fields for each search; GET `https://api.thingiverse.com/search/{encoded-query}`, `Authorization: Bearer token` | Same behavior, scoped to Thingiverse |

Storage/retrieval/removal are in `src/providers/credentials.ts` through extension
`storage.local` only, never web storage or sync. Normalization accepts only declared
nonempty string fields. The normal display projection includes configured status
and non-secret fields, never keys/tokens. Adapters have no credential cache. Disabling
a provider preserves credentials and skips its adapter; re-enabling reuses them.

Removal is local deletion, not provider-side revocation or guaranteed secure
physical erasure. It cannot retract an already dispatched request. Existing
requests may finish; a new search cancels old work and rereads configuration.
Transient input, local variables, storage change events, and request objects must
necessarily carry values in memory. JavaScript does not guarantee memory zeroing.
`storage.local` is not encrypted by tridiJump or an OS credential vault.

## Destination / registry boundary

Each API origin, endpoint construction, credential lookup ID, field semantics and
authentication mechanism are literal packaged adapter code. Query text is encoded
as a parameter or path segment, never interpreted as a destination. All authenticated
requests omit cookies and use `redirect: error`, preventing redirect-based credential
forwarding. There is no shared global Authorization header or auth interceptor.
Only Cults and Thingiverse send Authorization, to their own fixed HTTPS origins.
MMF sends no Authorization header. Only its own fixed origin receives its query key.

There is **no remote registry loader** in this checkout. The bundled
`src/providers/availability.ts` imports packaged factories. Remote descriptor data
is not fetched, passed as adapter options, or interpreted as executable code.
Tests attach conflicting origin/header/credential-mapping descriptions and confirm
the packaged factories still use their fixed official destinations and fields.
Simultaneous requests with three distinct fake credentials also verify that one
provider never receives another provider's key. A URL-looking query cannot redirect
an authenticated request.

Any future remote registry must remain inert metadata. It must not control factory
options, endpoint origins, authentication headers, credential storage IDs or field
mapping. Changing the bundled extension itself is a different trust boundary.
No new registry architecture was added during this audit.

## Leak-channel review

| Channel | Result |
| --- | --- |
| Application console/debug logs | No production console logging, request dumping, debug global or credential diagnostic object found; runtime spies exercise success/error flows. |
| Thrown errors and error UI | Adapter storage/network/JSON/auth failures use fixed messages or numeric HTTP status; server error bodies and raw exceptions are not forwarded. Existing orchestrator displays adapter messages, so adapters must retain this discipline; it is not a global secret redactor. |
| API query strings | MMF exception described above. Cults/Thingiverse secrets are headers, absent from URL/body query data. |
| Browser history/page URLs | Credential editor has no navigation submission; API fetches are not page navigations. Results URLs contain search query and toggle only. |
| Search history | Configuration never calls history recording; it records only original user search input. Saves, replacements and removals do not copy credential records into history. |
| Results/cards/images | New adapter guard rejects known authentication echoes in normalized metadata before results reach the orchestrator or UI. Generic HTML/HTTP(S) safety checks remain in place. |
| Registry/provider descriptions | Packaged descriptors and field definitions contain no stored values; factories load secrets independently. |
| Git | No real credential identified in tracked files, local object database or local config. `.env`, `.env.*`, logs, dist and dependencies are ignored; ignore rules alone are not secret detection. |
| Fixtures/examples/screenshots | Fixtures are declared original synthetic records. Test secrets are fake. Repository graphics are three SVG demo assets; no captured screenshots, HARs or binary credential examples found. |
| Analytics/telemetry | No implementation, dependency, event reporting or remote sink found. Production fetch sites are the three provider requests. |
| Exported settings | No settings-export feature exists. Preferences are a whitelist of three non-secret fields, separate from credential records. TypeScript exports are code APIs, not an export of stored settings. |
| DOM attributes | Saved secret fields remain blank; masks do not encode length. No stored key is assigned to text, HTML, dataset, title, href or value attributes by the credential editor. |
| Debugger / browser storage / network inspector | A user or software able to inspect the extension/browser profile can inspect local values and authenticated requests. This audit does not claim to protect credentials from that privileged access. |

These guarantees concern application-managed credentials. They do not prevent a
user from pasting a secret into an ordinary search field (which can enter query
URLs/history and provider search terms), a compromised recipient provider from
misusing credentials it legitimately receives, or arbitrary encodings of a secret
in malicious returned content. The new guard covers known raw, URL-encoded and
Cults Basic representations; it is not a general data-loss-prevention system.
Do not capture/share real Settings entries, storage dumps, screenshots while typing,
request objects or HAR files. Basic encoding is reversible, not encryption.

## Validation and changes

- New `tests/credential-audit.test.ts`: distinct credentials across simultaneous
  fixed-origin requests; misleading query destinations; network/body errors with
  raw and Basic-encoded fake secrets; secret-free status DOM, metadata and history;
  removal/setup-required; malicious successful response echoes before image load.
- Refined `tests/credentials.test.ts`: raw/URL/Basic echo rejection and fixed errors.
- Existing Settings display, replacement/removal, registry conflict, cancellation,
  auth-failure isolation and Settings-to-Results tests remain part of the suite.
- No backend, encryption layer, registry framework, runtime dependency or permission
  was introduced. Existing provider request/auth protocols remain unchanged.
- Commands: repository keyword/transport searches; local Git object/config scan;
  `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`; generated
  asset inspection for fixtures, fake keys, logging and remote executable code.

Validation completed: **174 tests passed across 16 files**, typecheck passed,
production build passed, and diff whitespace checks passed. Generated assets
contain no fake test credentials, console logging or remote executable script
references; manifest permissions remain unchanged.

Authenticated live requests and user browser-profile storage were not inspected;
all automated checks use fake credentials and mocked HTTP/extension storage.
