# V1 Settings (Prompt 13)

Settings has four areas: Repositories, Provider setup / credentials, Search, and
Appearance. Repository switches and preferences save automatically. Credential
forms save only on submission. Existing API transports and normalization are
unchanged; the user reported Thingiverse, MyMiniFactory and Cults3D working live
before this change. The agent has not repeated authenticated live testing.

## Release-audit follow-up

Read the [historical final audit](release-audit.md) for the original V1 blockers.
[Expanded Search](expanded-search.md) now dispatches the original plus at most
three local English/German phrase/synonym variants; other release gates remain.
Read/modify/write history and repository updates, plus legacy migrations, now
use same-origin Web Locks across extension pages where supported. Tests emulate
separate page modules and delayed reads; native Chromium verification is pending.
The [privacy inventory](../PRIVACY.md) lists all network and credential behavior.

## Local storage

All V1 state uses browser/chrome `storage.local`, requiring only the existing
`storage` permission. No synchronization, export, network settings/history storage
or new permissions/dependencies were added.

- `tridijump.preferences`: theme, Expanded Search default, history enabled.
- `tridijump.repositories`: provider-ID to boolean selections. Missing entries
  default enabled; old/unknown selections are retained for later bundled entries.
  Packaged `available: false` metadata takes precedence over user selections.
- `tridijump.history`: at most 50 unique original queries, newest first.
- `tridijump.credentials.<providerId>`: only that adapter's declared fields.

Legacy preferences/history in extension-origin web localStorage migrate when the
extension-local key is absent. Migration normalizes known fields and removes the
old key only after writing successfully. Existing extension-local values win.
Clearing history stores an empty array, preventing legacy history resurrection.
Disabling history preserves existing entries and stops new collection. Disabling
a repository never removes credentials; only Remove credentials does so.
Repository settings read failures prevent search dispatch rather than assuming
all repositories are enabled.

`storage.local` is local application storage, not an encrypted OS credential vault.
Saved secrets are never put back in input fields, even password fields. The display
helper returns configuration status and declared non-secret values only; the UI
uses a fixed eight-bullet mask independent of secret length. Replacement uses blank
fields, clears submitted input on success or failure, and retains the old key if
saving fails. Cancel discards unsaved replacement inputs. Provider errors and UI
storage failures use fixed, sanitized messages. There is no settings export.

## Authentication and registry boundary

For user-facing onboarding, availability categories, official provider links and
why credentials are needed, see
[supported repositories and provider credentials](supported-repositories.md).
tridiJump neither provides nor proxies keys, and no tridiJump server receives
them. Users can remove them at any time in Settings; only the corresponding
provider receives the configured credential when a search is sent.

This checkout has a bundled list (`src/providers/availability.ts`), not a dynamic
GitHub registry loader or registry.json. No remote registry is fetched or executed.
All factory references, credential field semantics, storage IDs, destinations and
authentication construction stay in packaged TypeScript. Descriptor objects are
not passed to factory/authentication options. Tests supply conflicting destination,
header and credential-mapping metadata and confirm each packaged factory still
uses its fixed official origin and documented credentials.

Only the three implemented authenticated providers have credential forms:

| Provider | Fields | Official credential page and documentation |
| --- | --- | --- |
| Cults3D | Nickname, API key | [API keys](https://cults3d.com/en/api/keys), [API guide](https://cults3d.com/en/pages/graphql) |
| MyMiniFactory | API key | [Developer settings](https://www.myminifactory.com/settings/developer), [official API README](https://github.com/MyMiniFactory/api-documentation/blob/master/README.md) |
| Thingiverse | App Token | [My Apps](https://www.thingiverse.com/developers/my-apps), [getting-started guide](https://www.thingiverse.com/developers/getting-started) |

Use your own free access. MyMiniFactory's documented `key` query parameter is the
existing protocol exception; no other key is put in a URL. Requests omit cookies
and reject redirects. Native-search URLs contain only the search query, never
stored credentials. Printables works immediately with no credential form; its
basic anonymous search and a tested model link were user-live-verified in Chromium
on 2026-10-28. Cover images remain pending; see
[Printables notes](provider-printables.md). MakerWorld and Thangs
remain native-search-only.

## Manual regression checks

Load the newly built `dist/` as an unpacked Chromium extension (or reload it after
this code update). Open its Settings. Preference changes thereafter need no reload.
Use your own credentials in Settings, never chat or developer tools/log output.

A. **Configured providers:** configure the three providers using their official
   links. Expect Configured, fixed masks and blank hidden editor fields. Enable all
   three. Search `cap` from the popup; confirm Searching, progressively arriving
   real cards from configured sources, and original model-page destinations.
B. **Disable:** disable one configured source. Search again in the existing Results
   tab. Expect Disabled for it and no request/cards from it; Settings still shows
   its credentials configured. Its native-search link is also excluded.
C. **Re-enable:** enable it and search again. It should work without re-entering keys.
D. **Remove:** Remove credentials for one enabled source. Search again. Expect Setup
   required and Configure/native-search links; other sources still return cards.
   Test Replace credentials too: fields start blank and a new saved key replaces
   the old one. Cancel replacement retains the old key.
E. **Expanded Search default:** enable the default, open a new popup and confirm
   the toggle is on. Changing the default must not restart an existing Results
   search. Turn it off and open another popup to confirm off. Search `gear` with
   expansion on: expect original, `Zahnrad`, `cogwheel`, `cog` for searchable
   providers. With it off, expect only `gear`. Unconfigured adapters check
   configuration once per explicit search without network requests.
F. **History:** enable Save recent searches locally, search, and confirm the query
   appears in Settings without reloading it. Disable collection and search again:
   old entries remain, the new query is absent. Clear search history; expect an
   empty list. Credentials must never appear in it.
G. **Theme:** keep Settings and Results open. Select Light, Dark and System; confirm
   all pages, including a new popup, follow the choice. With System selected,
   change OS/browser preferred color scheme; CSS should follow automatically.

## Automated checks and known limits

Vitest exercises repository persistence/defaults and rapid switches, state
combinations for all three adapters, removal/replacement, secret-free display and
logs/history/metadata, fixed auth destinations, preference migration, history
bounds/clearing/retention, cross-page storage theme events, defaults on future
pages, unchanged active searches, and the real Settings-to-Results pipeline using
fake credentials and HTTP fixtures. Existing timeout/cancellation/parser tests
remain in the full suite. DOM tests are not authenticated browser/live tests.

There is no dynamic official registry implementation in this checkout. New bundled
entries preserve selections, and the pure availability helper supports a trusted
unavailable flag. A remote metadata loader is outside Prompt 13. The later
Expanded Search blocker fix connects the small local phrase map to the existing
variant-aware runner; it does not add another search subsystem.
