# tridiJump

A lightweight browser extension for searching multiple 3D-model repositories
asynchronously and displaying models on one unified results page.

This is the extension foundation only. Provider searching and synonym expansion
are not implemented.

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

Open the toolbar popup and follow its results and settings links. Settings is
also available through the extension's **Options** menu.

```sh
npm test             # Run Vitest checks
npm run test:watch   # Watch tests
npm run typecheck   # Strict TypeScript checks
npm run build       # Type check and production build
```

## Structure

- `src/popup/`, `src/results/`, `src/settings/`: plain HTML/TypeScript entry pages
- `src/shared/`: shared styles and code
- `src/search/`, `src/providers/`, `src/synonyms/`: reserved for later implementation
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
