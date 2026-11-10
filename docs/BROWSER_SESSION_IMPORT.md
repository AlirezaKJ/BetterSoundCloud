# Import a SoundCloud browser session

BetterSoundCloud 0.8.0 opens Google sign-in in the system browser. That browser's
SoundCloud session does not automatically reach the app. To use a session from Zen,
Firefox, or Edge:

1. Sign in to SoundCloud in the browser.
2. On `soundcloud.com`, use Cookie-Editor to export the current site's cookies as
   an unencrypted JSON file.
3. In BetterSoundCloud, open **Settings → Advanced → Import browser sign-in** and
   choose the JSON file. The SoundCloud page reloads with the imported cookies.

The JSON file contains live session credentials. Keep it private and remove it
when you no longer need it. The app reads the chosen file once; it does not copy
the file into the project or upload it. `cookies.json` is ignored by Git, but any
other export filename should also be kept out of commits.

## Implementation

- The settings view requests an import through its preload bridge. Main accepts
  the request only from that view and opens the system file picker; the renderer
  never receives the path or cookie values.
- `src/main/cookie-import.ts` parses a Cookie-Editor JSON array and imports only
  `soundcloud.com` cookies and its subdomains into the content view's session.
  Cookies for Google or other sites are ignored.
- After a successful import, main reloads the SoundCloud content view. A canceled
  picker changes nothing; malformed files and files without SoundCloud cookies
  produce an error in the settings row.

This transfers an existing SoundCloud session. It does not complete Google's
OAuth flow inside BetterSoundCloud or guarantee that SoundCloud will accept the
transferred session. If the session expires or is rejected, sign in again in the
browser and import a fresh export.
