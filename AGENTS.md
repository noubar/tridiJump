# Permanent tridiJump provider policy

Read [docs/provider-policy.md](docs/provider-policy.md) before provider-related
work. This user-approved policy applies to all subsequent tridiJump tasks.

- Prefer unauthenticated official/public APIs, then eligible free user-key
  official APIs, then legitimate public endpoints, then appropriate HTML parsing,
  then native-search fallback. Do not require paid API access for V1.
- Never bypass authentication, CAPTCHAs, anti-bot protections, rate limits, or
  access controls. Verify provider access and usage conditions before enabling it.
- Support free user credentials through Settings and extension `storage.local`
  only. Never bundle developer credentials, synchronize credentials, expose saved
  secrets, or include credentials in Git, registry data, logs, errors, debugging,
  history, exports, or remote storage. Send them only to their provider through
  its documented authentication mechanism. URLs are prohibited unless that
  official protocol absolutely requires them; native-search links contain no keys.
- Never ask for credentials in Codex/chat. Use fake credentials and fixtures in
  tests. Local storage is not an encrypted operating-system credential vault.
- Missing configuration means non-error `setup-required`, with Settings routing
  and native fallback where available; it must not prevent other providers working.
- Expanded Search must not multiply requests for setup-required providers. Resolve
  their configuration once per explicit search, then skip all expanded terms and
  retries for them. A new explicit search can recheck credentials saved in Settings.
- Keep credential support small, parsing provider-local, and orchestration generic.
  Preserve staged implementation scope; policy updates alone do not enable providers.
- Classify each remaining provider A (no credentials), B (free user credentials),
  C (paid API), or D (no appropriate aggregation interface) before implementation.
  Follow the current `docs/live-provider-enablement.md`; the older all-fallback
  classification is historical. Do not infer API pricing from account/marketplace
  pricing. The live enablement task authorizes documented user-key integrations
  against mocks when development keys are absent. Record unverified issuance,
  fees and live compatibility honestly; use only the user's own free API access.
- Every authenticated adapter needs tests for missing-key setup-required, correct
  authenticated request, isolated auth failure, no secret in errors, and Remove
  Credentials returning it to setup-required. Use mocks when live keys are absent.
  Never downgrade an appropriate free official API to scraping to avoid user keys.

Keep the existing TypeScript/plain HTML/CSS, Manifest V3, Chromium-first
architecture. No UI framework, backend, telemetry, or remote executable code.
