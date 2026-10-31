# Draft: Creality Cloud official API access request

**Not sent.** This is a maintainer-reviewed email draft for
`teamcloud@creality.com`. Do not add credentials or private account information.

Subject: Official read-only model-search integration for tridiJump

Hello Creality Cloud team,

tridiJump is a GPL-licensed open-source Chrome, Edge and Firefox browser extension
that lets users search multiple 3D-model repositories from one interface.

We would like to add Creality Cloud using an official, supported integration.
The proposed integration would be limited to read-only discovery:

- search models after a user enters a query;
- display model title, creator, price/free state, file-format metadata and
  API-provided preview images where permitted;
- link every result directly to its original Creality Cloud model page;
- never purchase, download, upload, slice or redistribute models;
- never control printers or access private cloud files, messages or account data;
- never scrape Creality Cloud pages.

Because browser-extension source and packages are public, tridiJump cannot safely
embed a confidential API key, client secret, session token or private partner
credential. tridiJump has no backend, analytics or telemetry.

Could you please confirm:

1. whether Creality Cloud provides an official model-search API for third-party
   applications;
2. whether this read-only search-and-click-through use is permitted;
3. whether API-returned preview images and public metadata may be displayed in
   extension result cards;
4. whether anonymous read-only model search is available;
5. whether OAuth Authorization Code + PKCE is available for public browser clients
   without a client secret;
6. alternatively, whether ordinary users may obtain their own read-only API
   credentials for this integration;
7. whether you provide an application credential explicitly designed for public
   distribution in open-source browser extensions;
8. the supported endpoints, scopes, quotas, rate limits and CORS requirements;
9. model ID/URL, pricing or credits, file-format, content-flag and pagination
   semantics;
10. attribution, branding, thumbnail licensing, privacy or browser-store listing
    requirements.

Project: https://github.com/noubar/tridiJump

Thank you,
Noubar
