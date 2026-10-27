# V1 provider architecture review

**Credential follow-up (2026-10-27):** the subsequently authorized task now adds
optional `credentialFields`, shared extension-local load/save/remove/configured
helpers, Settings configuration, and generic `SetupRequired` handling. Cults
loads only its own credentials before network dispatch. Missing configuration
publishes `setup-required` and a Settings route; other providers proceed. The
asynchronous read is followed by an abort check, and the orchestrator's existing
stale/timeout guards remain in force. No generic authentication platform was added.
This is the only concrete addition needed to the bounded V1 provider contract;
the search signature can remain stable. Live compatibility is still unverified.
The review below records the earlier state and staged requirements, now completed
by this follow-up. Current behavior is in [Cults integration notes](provider-cults3d.md).

Reviewed 2026-10-27 after the Cults3D adapter implementation. No additional
provider was added. Cults remains disabled in production under the existing
[access policy](provider-policy.md); this review does not enable it or establish
authenticated live compatibility.

## Decision, updated for the explicit V1 credential policy

The search method can be treated as **stable for V1's bounded search**:

```ts
interface Provider {
  id: string;
  search(query: string, signal?: AbortSignal): Promise<ModelResult[]>;
}
```

The adapter did not demonstrate a need for required result metadata, generic
credentials in search arguments, error classes, pagination capabilities, base
classes, registries, or a shared transport layer. None was introduced.

The subsequent explicit [V1 credential policy](provider-policy.md) does establish
concrete requirements for provider configuration declarations and a
`setup-required` state. The state type now includes this non-error condition;
configuration declarations and dispatch handling remain unimplemented.
Therefore the **complete provider/configuration contract
is not yet frozen for V1**. The stable part is `id` plus the search signature;
small additive configuration metadata and setup handling belong to the staged
implementation task, not a redesign of search execution or `ModelResult`.

Prompt 08 remains a review. No provider was implemented/enabled and no credential
UI/storage, runtime declaration, or permission changes were made for
this policy update. The only runtime type addition is `setup-required`, with a
type-contract test ensuring it requires neither a query nor an error.
The earlier local refactor and cooldown correction below
remain valid. Authenticated live verification is pending independently of contract
stability; unavailable development credentials alone must not prevent implementing
an eligible free API against official documentation and fixtures/mocks.

## Boundaries reviewed

| Concern | Assessment |
| --- | --- |
| Provider interface | Stable ID plus one asynchronous method. Successful empty searches return `[]`; failures reject. No UI or repository response types cross this boundary. |
| Repository details | Cults owns its endpoint, GraphQL selection, auth encoding, rate-limit policy, response validation, field mapping, and encoded fallback route. These details are not in the orchestrator. |
| Composition and UI | The entry page names Cults and displays its fallback/access disposition. That is composition, not parsing leakage. Cards, filters, sorting, and results rendering consume `ModelResult` and generic search states. |
| Result model | Only title, URL, and provider ID are mandatory. Cults omits unavailable formats, star ratings, and creation dates; it does not relabel publication dates or likes as those fields. |
| Orchestration | It schedules generic providers independently, owns timeouts and per-run cancellation, and guards against stale settlement. No Cults-specific endpoint, payload field, auth branch, or rate-limit parsing appears in core. |
| Error isolation | Adapter failures reject with safe messages. The core marks only that provider failed. GraphQL envelopes and remote error bodies stay inside the adapter. |
| Permissions | Current production uses direct links only and requests no API hosts or other privileges. An enabled adapter would need only its precise API origin; no permission was added during review. |

The current disabled Cults adapter rejects absent credentials. Although the
state union now supports `setup-required`, no configuration preflight emits it
yet. These behaviors are **not the finished V1
setup experience** under the new policy. The configuration preflight must stop
an unconfigured provider before `search` and publish Setup required with a
Settings route and direct-search fallback. Missing credentials must not become
`failed`; genuine transport/authentication errors remain isolated failures.

## Concrete staged follow-up required by policy

This is review scope and acceptance criteria, not a new runtime implementation:

1. Add only the optional provider configuration declaration necessary to describe
   required field names, user-facing labels, and which values are secrets. Keep
   endpoint/auth/GraphQL logic provider-local. Do not put values in declarations
   or provider registry data. No declaration should be required for credential-free
   providers, and no generic authentication framework is justified.
2. Add a small provider-keyed credential store using extension local storage
   (`browser.storage.local` / Chromium `chrome.storage.local`). It must not use
   sync storage or the existing preferences/history `localStorage`. Its only
   necessary operations are loading a provider's credentials for execution,
   saving/replacing them, clearing them, and obtaining configured status.
3. Render credential fields in Settings only for implemented providers that need
   them. Provide Save, Remove/Clear, and configured/not-configured feedback.
   Mark the store local and not an OS vault. Do not repopulate saved secrets or
   include credentials in settings exports, debugging, errors, or history. URLs
   may carry credentials only if the official auth protocol absolutely requires it.
4. Perform configuration preflight before dispatch and emit `setup-required` with
   a configuration route. Skip that provider's network search while allowing
   configured providers to proceed. Snapshots contain status, never secrets.
   Preserve timeout, cancellation, and stale-response protection across the
   asynchronous storage read; a superseded read must not launch an old search.
5. Pass only a provider's own credentials to its execution/configuration boundary.
   Resolve them outside raw search arguments, preserving the current search
   signature. The provider alone chooses documented auth and its fixed destination.
6. Add only the storage permission when storage is implemented and the precise
   API host when its integration is enabled. No broad origin, cookies, identity,
   background, or scripting permissions follow automatically from this policy.

Required follow-up tests: local save/remove/configured state; no secret prefill,
sync, export, logging, history, or registry exposure; separation of providers'
stored values; setup-required without a network request/failure; configured
providers continuing independently; Settings/fallback routing; documented auth
only to the correct origin; and cancellation during configuration loading.
The present test suite does not claim to verify this unimplemented functionality.

Current official Cults eligibility, free access, normal-user key issuance, rate
limits, needed search fields, and relevant use restrictions must be verified
before that provider stage proceeds. Credentialed APIs are supported by policy;
neither a shared operator key nor successful authenticated testing in Codex is
a prerequisite for writing a fixture-tested adapter once eligibility is established.

## Concrete corrections

1. **Query helpers shared a module with DOM form wiring.** The new provider and
   orchestrator imported that module for pure query normalization. Moved the
   existing `initializeSearchForm` function unchanged into `src/search/form.ts`.
   Query parsing/normalization remain in `src/search/query.ts`; provider/core
   imports now reach a UI-independent module. Updated entry pages and the existing
   form test. This is a local dependency correction, not a new layer or abstraction.
2. **A zero-second retry delay became a one-minute cooldown.** A regression test
   reproduced the issue in the Cults adapter's reset-time comparison. Corrected
   that comparison to honor a usable reset time equal to the current time. The
   adapter still performs no automatic retries; the next explicit search may run.
   Rate-limit handling stays repository-local.

No orchestrator, provider-interface, result-model, or permission redesign was
needed.

## Verification

Added tests that run the **actual Cults adapter** through the **actual
orchestrator**, intercepting only HTTP and time:

- A GraphQL error fails only Cults while a companion mock returns a minimal
  three-field model. Remote error text does not enter snapshots.
- A core timeout aborts the adapter's fetch. Its subsequent AbortError does not
  change `timed-out` into `failed` or remove another provider's results.
- Starting a new query during JSON body reading aborts the old signal. Even a
  body reader that ignores cancellation cannot publish stale results afterward.
- A valid empty GraphQL batch becomes `no-results`, with no fabricated metadata.

Existing tests continue to cover progressive delivery, ordinary cancellation,
duplicate provider IDs, query provenance, optional result metadata, safe cards,
and the production path's lack of API requests/credential collection. The
zero-second cooldown regression is also covered independently.

These tests use synthetic fixtures and mocked HTTP, not a live API key. Complete
test, typecheck, and production build checks were run for this review. No network
access or credentials were needed to validate the architecture.
