# tridiJump

A lightweight browser extension for searching multiple 3D-model repositories
asynchronously and displaying models on one unified results page.

The V1 application shell includes a search popup, results layout, and settings.
Provider searching and synonym expansion are not implemented. Results show an
empty state, with no demo models or network requests.

## Development

Requires Node.js 24 or newer and npm.

```sh
npm ci
npm run dev
```

Development watches files and rebuilds `dist/`. In Chromium, open
`chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and
select `dist/`. Reload the extension after rebuilding and refresh open pages.
The extension uses packaged assets without a development server.

Enter a query in the toolbar popup and press Enter or Search to open results in
a normal browser tab. The query and Expanded Search toggle travel as encoded
URL parameters. You can edit and resubmit the search on the results page.
Settings is available from the popup, results page, and extension's **Options**
menu.

Settings include the Expanded Search default, optional local search history
(off by default, up to 20 recent queries), and System/Light/Dark themes. Use
**Save settings** to apply changes. System follows device color preferences;
saved theme changes also apply to other open extension pages. History can be
cleared, and disabling it clears existing history. Preferences and history use
extension-origin `localStorage` on this device; nothing is synced or sent away.

There are currently zero available repositories. Repository selection, result
sorting, and model filters remain empty or disabled until providers exist.

```sh
npm test             # Run Vitest checks
npm run test:watch   # Watch tests
npm run typecheck   # Strict TypeScript checks
npm run build       # Type check and production build
```

## Structure

- `src/popup/`, `src/results/`, `src/settings/`: plain HTML/TypeScript entry pages
- `src/shared/`: shared styles and code
- `src/search/`: query parsing and shared native form setup
- `src/providers/`, `src/synonyms/`: reserved for later implementation
- `providers/`: reserved for provider definitions
- `public/manifest.json`: Manifest V3 configuration, copied to `dist/`
- `tests/`: extension foundation checks

Uses TypeScript, plain HTML/CSS, Vite, and Vitest. No runtime dependencies,
framework, backend, accounts, analytics, telemetry, cloud storage, AI APIs, or
remote executable code. The foundation requests no extension or host permissions.

## License

SPDX-License-Identifier: GPL-3.0-or-later

Copyright (C) 2026 tridiJump contributors.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full terms.
