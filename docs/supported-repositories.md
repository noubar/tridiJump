# Supported repositories and provider credentials

Updated 2026-10-28. These categories describe searching inside tridiJump's grid.
Native **Search directly** links remain available for every enabled repository.

| Repository | Availability | What you need |
| --- | --- | --- |
| Printables | **Works immediately** | Enable the repository and search. No account or API credential is required by tridiJump. Basic anonymous search/cards and a tested model link were live verified by the user; cover images remain candidate/pending verification. |
| Cults3D | **Requires free provider setup** | Your Cults3D nickname and a read-only API key. |
| MyMiniFactory | **Requires free provider setup** | Your application's MyMiniFactory API key. |
| Thingiverse | **Requires free provider setup** | Your application's Thingiverse App Token. |
| MakerWorld | **Direct-search fallback** | Opens native search; no aggregation interface has been verified for this implementation. |
| Thangs | **Direct-search fallback** | Opens native search; no appropriate public catalog interface has been established and the investigation records scraping restrictions. |

“Requires free provider setup” means tridiJump supports your own free API access;
it does not supply keys or guarantee that every new account can obtain one today.
Provider eligibility and issuance can change. Current free issuance for all three
providers was not independently completed here. If official onboarding requires
payment specifically for API access, use native search instead: tridiJump V1 does
not require a paid API subscription. Model purchases are separate from API access.
See the [evidence and limitations](live-provider-enablement.md) and
[Printables verification record](provider-printables.md).

## Why some providers require credentials

These integrations use provider APIs that authenticate requests rather than
accepting anonymous API searches. A key/token identifies the account or registered
application to that repository; the provider controls its access permissions and
usage limits. This is a requirement of that provider's API, not a tridiJump account.
The native website may still offer public search without an API key.

tridiJump does not issue, bundle, lend or proxy API credentials. Obtain your own
credentials directly from the repository. There is no tridiJump server receiving
them and no shared developer credential standing in for your access.

## Obtain and configure your own credentials

Follow the provider's official documentation and sign in only on its own website.
Never paste keys into chat, GitHub issues, screenshots or documentation. No real
key or token is included in this guide.

### Cults3D

The [official GraphQL guide](https://cults3d.com/en/pages/graphql) describes API
authentication using your Cults nickname and an API key. The key is the API
credential; do not enter your account password in tridiJump.

1. Sign in to Cults3D and open its [API keys page](https://cults3d.com/en/api/keys).
2. Create a dedicated read-only key. If the route changes, follow the key link
   from the official guide. Cults documents read-only keys in its
   [official release log](https://cults3d.com/en/pages/logbook-updates-new-features-cults).
3. In tridiJump **Settings → Provider setup / credentials → Cults3D**, enter your
   nickname and key, then choose **Save credentials**.

Only Cults3D receives these credentials, using the guide's HTTP Basic mechanism
over HTTPS. No credentials belonging to other repositories accompany the request.

### MyMiniFactory

The [official API README](https://github.com/MyMiniFactory/api-documentation/blob/master/README.md)
requires an authenticated API client and directs you to account settings and its
[developer page](https://www.myminifactory.com/pages/for-developers).

1. Sign in to MyMiniFactory and open
   [Settings → Developer](https://www.myminifactory.com/settings/developer).
2. Create an application/API client and obtain its **API key**. tridiJump's search
   integration needs the API key, not an OAuth client ID, client secret or password.
3. In tridiJump **Settings → Provider setup / credentials → MyMiniFactory**, enter
   the key and choose **Save credentials**.

The [official API schema](https://github.com/MyMiniFactory/api-documentation/blob/master/myminifactory-api.yaml)
requires the key in the provider's HTTPS API request URL. This is the narrow
documented exception to keeping credentials out of URLs. The key is sent only
to MyMiniFactory; it is never attached to native-search links, search history,
application logs or error messages. Avoid sharing raw network request URLs.

### Thingiverse

Start with Thingiverse's
[official getting-started guide](https://www.thingiverse.com/developers/getting-started).
The implemented developer API path uses the application's **App Token** to
authenticate search requests, rather than a website login session.

1. Sign in to Thingiverse and open
   [Developer → My Apps](https://www.thingiverse.com/developers/my-apps).
2. Create an application, open its details and obtain its **App Token**. Do not
   substitute the client secret, account password or a browser session token.
3. In tridiJump **Settings → Provider setup / credentials → Thingiverse**, enter
   the App Token and choose **Save credentials**.

The token is sent only to Thingiverse's API in its Authorization header over
HTTPS, never in a native-search URL. If the provider changes or removes its
enrollment route, consult the official guide; native search remains available.

## Storage, replacement and removal

Saved credentials remain in this browser profile's extension **`storage.local`**
(`chrome.storage.local` in Chromium). They are not synchronized, exported, put in
search history, logged or stored remotely. tridiJump loads only the credential
needed for the selected repository and sends it directly to that repository's
bundled API origin, never to another source, tridiJump or GitHub.

**Extension local storage is not an encrypted password vault.** tridiJump does not
encrypt these values or store them in an operating-system credential vault.

After saving, Settings shows **Configured** and a fixed mask rather than the saved
secret. Password fields are not prepopulated. Use **Replace credentials** to enter
new values in blank fields, or **Remove credentials** at any time to delete the
local configuration. Removal returns the next enabled search to **Setup required**;
it does not revoke the credential at the provider. Revoke it on the provider's
website if you also want to invalidate it there.

Without configured credentials, the provider shows **Setup required** with
**Configure** and **Search directly** links. This is not a failure and does not
prevent other repositories from returning cards. Save credentials and submit a
new search to use the provider; no extension reinstall or reload is needed.

## Documentation verification limits

Official sources were checked on 2026-10-28. MyMiniFactory's public API README
and schema were readable. Cults' indexed official API guide/release log confirmed
nickname/key authentication and read-only keys; direct English-guide retrieval
and Thingiverse's getting-started page returned HTTP 403 to the research tool.
No login or access challenge was bypassed. These retrieval limits do not establish
that API access is paid or unavailable in your browser. Account-specific free key
issuance was not verified, and successful existing-user searches do not prove new
account eligibility. Provider documentation remains authoritative for onboarding.
