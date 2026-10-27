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
- Keep credential support small, parsing provider-local, and orchestration generic.
  Preserve staged implementation scope; policy updates alone do not enable providers.

Keep the existing TypeScript/plain HTML/CSS, Manifest V3, Chromium-first
architecture. No UI framework, backend, telemetry, or remote executable code.
