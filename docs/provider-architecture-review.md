# V1 provider architecture review

Reviewed 2026-10-27 after the Cults3D adapter implementation. No additional
provider was added. Cults remains disabled in production under the existing
[access policy](provider-policy.md); this review does not enable it or establish
authenticated live compatibility.

## Decision

The provider contract can be treated as **stable for V1's bounded search**:

```ts
interface Provider {
  id: string;
  search(query: string, signal?: AbortSignal): Promise<ModelResult[]>;
}
```

The real adapter did not demonstrate a need for additional interface members,
required metadata, generic credentials, error classes, pagination capabilities,
base classes, registries, or a shared transport layer. None was introduced.
Stability here means the current contract is sufficient for the implemented V1
behavior; it is not a statement that the disabled adapter is production-verified.
Free API access, an authorized key, and authenticated schema verification remain
separate release conditions.

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
