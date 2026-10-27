# Provider access policy

User decision, 2026-10-27:

- Prefer an official API when access is free of charge. Requiring a user-supplied
  API key is acceptable; a key requirement alone does not disqualify a provider.
- Ask users for their own authorized key when a verified free integration needs
  one. Do not embed an operator secret or create a backend to hide credentials.
- Do not enable paid API integrations. If cost is unverified, treat free access
  as unconfirmed, not as an implied free tier.
- Where API access is paid/unavailable, consider HTML/public data only when the
  site's terms, content rights, and access controls permit the proposed use.
  Visible HTML and permissive robots guidance alone do not establish permission.
  Do not bypass authentication, anti-bot checks, or CAPTCHAs.
- Otherwise leave result aggregation disabled for that provider. A user-opened
  direct-search link may remain available independently of an API integration.

The public Cults API guide describes keys and rate limits but provides no explicit
free-access commitment verified in this investigation. Marketplace statements
about free account registration or seller fees do not establish API pricing.
The Cults adapter and synthetic tests are retained, but production uses only the
direct-search link, requests no API host permissions, and collects no key.

Before enabling it, verify free API access/key issuance and current schema using
authorized access, document the evidence, then connect the adapter and request
only the API's required host permission. Do not implement other repositories as
part of resolving this gate.

Sources checked: [API overview](https://cults3d.com/en/api),
[API guide](https://cults3d.com/en/pages/graphql).
