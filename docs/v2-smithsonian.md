# V2 Phase 2B: Smithsonian 3D

Smithsonian 3D is the first `specialist` provider in tridiJump. It uses the
official Smithsonian Open Access API with a user-supplied free api.data.gov key,
filters searches to records with 3D media, and opens the official Smithsonian 3D
Voyager object experience from each card.

The implementation adds no backend, runtime dependency, scraping, file download,
remote code or provider-specific behavior to the orchestrator. Provider tier is a
small metadata field (`general` or `specialist`); all existing repositories remain
`general`. Pagination, cancellation, setup-required handling, Expanded Search,
deduplication and failure isolation use the existing shared machinery.

See [Smithsonian provider details](provider-smithsonian.md),
[supported repositories](supported-repositories.md), and the
[privacy/network inventory](../PRIVACY.md).
