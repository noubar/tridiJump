# Chrome Web Store submission — tridiJump v1.0.0

## A. Extension name

tridiJump

## B. Short description

Search multiple 3D-model repositories in one place and open results on their
original sites.

## C. Detailed description

tridiJump searches supported 3D-model repositories from one clean results page.
Printables, Thingiverse, MyMiniFactory, and Cults3D can supply aggregated model
cards as each provider responds. MakerWorld and Thangs are available through
direct links to their native search pages. Selecting a card opens the original
model page; tridiJump does not host or download model files.

Results can be filtered by repository, known Free/Paid status, and file format
when the provider supplies format data. Sorting options activate only when enough
comparable metadata is available. Load more fetches the next provider pages on
request. Expanded Search can add up to three locally generated English synonyms
or English/German alternatives from packaged lexical data.

Settings, theme, repository choices, and optional search history are stored
locally. Some providers require the user to obtain free provider credentials and
save them in Settings. tridiJump has no account or backend and does not provide or
proxy credentials. Local extension storage is not an encrypted password vault.

## D. Single purpose

tridiJump's single purpose is to search multiple 3D-model repositories from one
browser extension and open matching models on their original repository pages.
Expanded Search, filters, sorting, pagination, local history, provider settings,
and direct-search fallbacks support that purpose.

## E. Category recommendation

**Tools.** Chrome currently describes Tools as the category for utilities that do
not fit a more specific category, which best matches a focused multi-repository
3D-model search utility. Confirm the label in the Developer Dashboard at submission
time. Reference: <https://developer.chrome.com/docs/webstore/best-practices#choose-your-category-well>

## F. Permission justification

### `storage`

Stores enabled repositories, Expanded Search preference, theme, optional search
history, and provider credentials in `chrome.storage.local`. These values must
persist across popup, results, Settings, and browser restarts. The extension does
not request `storage.sync`, so credentials and preferences are not synchronized.

## G. Host permission justifications

### `https://api.printables.com/*`

Allows the bundled service worker to send the user's search query, a page limit,
and offset to Printables' GraphQL search endpoint. No credential is sent. A more
narrow URL path cannot be expressed reliably as an MV3 host permission pattern.

### `https://api.thingiverse.com/*`

Allows user-initiated search requests to Thingiverse's API. The request contains
the query, page parameters, and only the user's Thingiverse App Token in its
documented Bearer header. The token is never sent to another origin.

### `https://www.myminifactory.com/*`

Allows user-initiated search requests to MyMiniFactory's v2 search API. The request
contains the query, page parameters, and only the user's MyMiniFactory API key in
the provider-documented `key` query parameter. The destination path is fixed in
bundled code. MV3 host permission patterns cannot restrict access to that single
path.

### `https://cults3d.com/*`

Allows user-initiated GraphQL search requests to Cults3D. The request contains the
query, page parameters, and only the user's Cults3D nickname/read-only key in the
documented HTTP Basic header. The credential is never sent to another origin.

No tabs, activeTab, scripting, cookies, content scripts, broad wildcard host, or
remote-code permission is requested.

## H. User data disclosure draft

Use the dashboard's current field names and disclose the following actual flows:

- User-entered search queries are processed to provide the search feature and are
  sent to enabled, configured model repositories. Expanded variants are generated
  locally and sent to those same repositories.
- Provider authentication information is entered voluntarily, stored in local
  extension storage, and sent only to its corresponding provider for search.
- Optional search history is stored locally and can be disabled or cleared.
- Preferences and repository configuration are stored locally.
- No data is sold or used for advertising, credit decisions, or unrelated purposes.
- tridiJump has no analytics, telemetry, backend, account, cloud sync, or human
  review of user data.

The listing and dashboard answers must remain consistent with
[PRIVACY.md](../../PRIVACY.md). Provider requests are necessary to the prominently
disclosed single-purpose search feature.

## I. Privacy policy URL

`[PUBLIC PRIVACY POLICY URL REQUIRED]`

Candidate after the release commit is public:
`https://github.com/noubar/tridiJump/blob/main/PRIVACY.md`

## J. Support URL

<https://github.com/noubar/tridiJump/issues>

## K. Store graphics checklist

- **128 × 128 store icon:** ready at `public/icons/tridijump-128.png`; verify its
  appearance in the dashboard preview.
- **At least one current screenshot:** manual action required. Capture the actual
  extension at 1280 × 800 or 640 × 400, full bleed, with no credentials, tokens,
  DevTools, private browser data, or unrelated tabs visible.
- Recommended screenshots: mixed progressive results; Expanded Search alternatives;
  minimal Settings/provider setup with blank credential fields; dark theme.
- **Small promotional tile, 440 × 280:** optional in current dashboard guidance;
  manual design/upload if desired.
- **Marquee, 1400 × 560:** optional; manual design/upload if desired.

Current official graphic requirements:
<https://developer.chrome.com/docs/webstore/cws-dashboard-listing#graphic-assets>

## L. Reviewer notes

1. Install and open the toolbar popup. Submit a model query to open the extension's
   Results page in a normal tab.
2. Printables is enabled without configuration and demonstrates aggregated cards.
3. Thingiverse, MyMiniFactory, and Cults3D show a neutral **Setup required** state
   until the reviewer supplies credentials issued by that provider. Credentials
   are not bundled and should never be sent to the developer.
4. MakerWorld and Thangs intentionally provide **Search directly** links; the
   extension does not claim aggregated support for them.
5. Results appear progressively. Provider failure, timeout, disabled, and setup
   states are isolated. Cards navigate to provider-owned model pages.
6. All executable code and English/German lexical data are packaged. There is no
   remote executable code, backend, telemetry, or advertising.
7. MyMiniFactory's official API requires its API key as the `key` query parameter.
   The exact HTTPS endpoint is fixed in bundled provider code; registry data cannot
   redirect it.

## M. Submission checks

- Upload `tridiJump-v1.0.0-chrome.zip`, whose root contains `manifest.json`.
- Enter the public privacy-policy URL and complete dashboard data disclosures.
- Upload at least one real current screenshot.
- Confirm developer identity, distribution regions, and any trader-status fields
  using the account owner's actual information.
- Submit only after smoke-testing the exact ZIP contents loaded unpacked.
