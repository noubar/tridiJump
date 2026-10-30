# tridiJump Firefox Desktop v1.0.0

## Reviewer overview

tridiJump is an open-source meta-search extension for 3D-model repositories.
Printables, Thingiverse, MyMiniFactory, and Cults3D provide aggregated cards.
MakerWorld and Thangs are native direct-search links. Thingiverse,
MyMiniFactory, and Cults3D require credentials obtained by the user from that
provider. Credentials stay in Firefox extension local storage and are sent only
to their provider. Local storage is not an encrypted password vault.

Search queries are sent directly to enabled repositories only after a
user-requested search. Expanded Search runs entirely from packaged English and
German lexical indexes, adds no more than three terms, and sends those variants
to the same enabled providers. tridiJump has no backend, accounts, analytics,
telemetry, advertising, affiliate tracking, cloud sync, or remote executable
code. Settings and optional history remain local. See [PRIVACY.md](../../PRIVACY.md)
for the complete network table and retention behavior.

## Firefox manifest decisions

- Permanent Gecko ID: `tridijump@noubar.extensions`. Future Firefox
  updates must keep this ID.
- Firefox Desktop minimum: `142.0`, where Mozilla's built-in data-transmission
  consent system is available.
- Required `searchTerms`: ordinary and expanded queries are transmitted to the
  enabled repository APIs to return results.
- Required `authenticationInfo`: user-provided credentials are transmitted to
  the one matching provider API when that provider is configured and searched.
- Firefox Android is not declared or submitted for this release.
- The event page uses the same bundled `background.js` source as Chrome through
  `background.scripts`; no remote script is loaded.

Mozilla references:

- [Firefox browser-specific manifest settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [Firefox background manifest support](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [Built-in consent for data collection and transmission](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

## Source build and package

Requirements: Node.js 24 or newer and npm.

```sh
npm ci
npm run build:firefox
npm run release:firefox
```

This also creates `release/tridiJump-v1.0.0-source.zip` for AMO review. The
source archive recursively collects approved source roots, rejects secrets and
local/build artifacts, then proves completeness with a clean `npm ci` and
`npm run build:firefox` rebuild whose output must match the release build.
`npm run source:firefox` performs the source-package workflow independently.

The development build is written to `dist-firefox/`. The verified upload package
is `release/tridiJump-v1.0.0-firefox.zip`, with `manifest.json` at its root. The
release command requires committed source and records the exact HEAD in
`release/SOURCE-COMMIT.txt`; it does not commit, tag, push, sign, or publish.

## Licensing and packaged data

Application source is GPL-3.0-or-later. The package contains `LICENSE`,
`THIRD_PARTY_NOTICES.md`, the relevant license texts, and provenance for bundled
Open English WordNet 2025 and TU Chemnitz Ding 1.9 data. Conversion is performed
by deterministic repository scripts. No model files are downloaded.

## Concise AMO reviewer notes

tridiJump meta-searches Printables, Thingiverse, MyMiniFactory, and Cults3D;
MakerWorld and Thangs remain direct-search links. Some aggregated providers use
the user's own provider credentials. Searches contact only enabled repositories.
Expanded Search locally produces at most three English/German variants before
searching those repositories. There is no tridiJump backend, analytics,
telemetry, advertising, affiliate tracking, or remote executable code.
