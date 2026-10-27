# V1 provider retrieval and credentials policy

Permanent product decision, updated 2026-10-27, applying to this and all subsequent
tridiJump work. This policy supersedes earlier
credential-free-only or tab-memory-only assumptions. A user's own free API key
is a supported V1 configuration; it is not a reason to reject an otherwise
suitable provider. tridiJump has no backend or tridiJump account system.

## Retrieval priority

Evaluate each repository in this order:

1. Official/public API or endpoint requiring no credentials.
2. Official API requiring a user-specific key/token, when access is free of
   charge, normal end users can reasonably obtain credentials, the provider
   permits the intended use, and browser-extension use is technically appropriate.
3. Other legitimate publicly accessible endpoints where appropriate.
4. HTML parsing/scraping when technically feasible and appropriate under the
   applicable terms/policies. Never bypass authentication, CAPTCHA, anti-bot
   protection, rate limits, or other access controls.
5. Direct native-search fallback / unsupported aggregation if none of the above
   is reasonably available.

Public visibility and permissive robots guidance alone do not establish permission
to aggregate or redisplay content. Follow applicable content and image rights.
Use native search as a separate user action, not a fabricated empty API success.

If API access specifically requires payment or a subscription, V1 must not require
users to pay for it. Investigate appropriate public endpoints or HTML instead;
use direct search when neither is appropriate/reliable. Unknown cost remains
unverified; do not infer API pricing from free account registration or seller fees.

## Local user credentials

Add provider-specific credential configuration to **Settings only when required
by an implemented provider**. Provide the required fields, Save, Remove/Clear,
and an explicit configured/not-configured state. Clearly label credentials as
local to this browser profile. Never display an existing secret in plaintext
after saving it; show configuration status instead. Saved secret values must
not be repopulated into the form, even as a prefilled password field.

Use browser extension **`browser.storage.local`** (Chromium's equivalent is
`chrome.storage.local`), not web-page `localStorage`, tab memory as the sole
store, `storage.sync`, or remote storage. Credentials must not be synchronized.
This local application storage is **not an operating-system credential vault**.
Do not claim application-level encryption, encrypted keys, or secure vaulting
unless that protection is actually implemented. No such protection exists here.

Credentials must never be hard-coded or placed in source code, Git, logs,
analytics, debug output, errors, exports, search history, remote storage, or
provider registry data (including `providers/registry.json`, if one is introduced).
Do not ask users to paste API keys into Codex/chat. Synthetic test credentials
must be unmistakably fake; never capture real authorization headers in fixtures.

Transmit a credential only to its associated provider and only through that
provider's documented authentication mechanism. Keep authentication, endpoint
selection, and response parsing inside the provider implementation. Do not share
credentials across providers, attach them to fallback URLs, or bundle a developer
secret. Never send credentials to tridiJump or GitHub. Never include credentials
in URLs unless the provider's official authentication protocol absolutely requires
it; this exception never applies to native-search fallback links. There is no
credential proxy/backend. Restrict network destinations and
request only storage/API permissions actually needed by an enabled feature.

## Setup state and the smallest reusable mechanism

The state model supports `idle`, `searching`, `success`, `no-results`, `failed`,
`timed-out`, `disabled`, and `setup-required`. The last is a non-error state for
an available integration awaiting user configuration.

An implemented provider must be able to declare whether it needs configuration
and which credential fields it requires (including labels and secret/non-secret
classification). Use the smallest reusable mechanism needed for this; no vault
framework, remote credential service, generic OAuth system, or plugin architecture.

Keep `search(query, signal?): Promise<ModelResult[]>` unchanged. Resolve required
configuration before network dispatch. If credentials are missing:

- Do not execute the network search and do not classify absence as failure.
- Expose the provider state **Setup required** (`setup-required` in code).
- Link to that provider's Settings configuration.
- Offer native/direct search when possible.
- Continue other configured providers independently.

Do not put secret values in search states, `ModelResult`, provider declarations,
or snapshots. Configuration declarations describe fields; configuration status
describes availability. Only provider execution receives that provider's values.
Bad/expired supplied credentials or a genuine server denial may still be a
provider failure; missing configuration is a separate condition.

## Cults3D verification and staged implementation

Before implementing/enabling Cults3D, verify current first-party documentation for:

- Whether API access/key issuance is free of charge.
- How a normal user obtains the nickname/API key and any eligibility limitations.
- The documented authentication mechanism.
- Rate limits/quotas and server guidance, where documented.
- Search support for the metadata tridiJump needs.
- Applicable restrictions on this browser-extension/metasearch use.

Record evidence and uncertainties. Do not treat unavailable development
credentials as a reason to refuse implementation once the documented access/use
requirements are met. Implement against official docs and appropriate synthetic
fixtures/mocks when necessary, and mark **live authenticated testing pending**.
Never claim that mocked tests verify the production schema or authenticated access.

The public documentation recheck still does not explicitly establish Cults API
pricing. The credential follow-up implements local Settings, configuration state,
and documented API transport using synthetic fixtures, without requiring a paid
subscription or live development credentials. Users must use only eligible free
access. Pricing and live authenticated compatibility remain documented uncertainties,
not claims of verified free access. First-party sources:
[API overview](https://cults3d.com/en/api),
[API guide](https://cults3d.com/en/pages/graphql).

Prompt 08 originally remained an architecture review and added only the state
type. The subsequent explicit credential implementation task authorizes the
small local mechanism and Cults configuration described in the integration notes.
No other provider has been implemented. Preserve the retrieval order above.
