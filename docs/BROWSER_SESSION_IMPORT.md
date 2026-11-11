# Import your browser's SoundCloud sign-in

Signing in to SoundCloud with Google, Apple or Facebook opens your web browser, and that sign-in
stays in the browser. To use it in BetterSoundCloud:

1. Sign in to SoundCloud in your browser (Chrome, Edge, Firefox, Zen, …).
2. With soundcloud.com open, use the Cookie-Editor extension to export its cookies as JSON.
3. In BetterSoundCloud, open **Settings → Advanced → Import browser sign-in**, choose the file,
   and SoundCloud reloads, signed in.
4. Delete the file. Anyone who has it can sign in as you.

**Only the sign-in is taken.** The export holds about fifty cookies: the sign-in, and SoundCloud's
ads, analytics, consent and preferences, and its bot check's own cookie. The app takes the three
that are the sign-in and leaves the rest in the file. The app's own cookies stay as they are,
except its old sign-in, which the new one replaces.

If the row says the file has no sign-in in it, or that it has expired, sign in on soundcloud.com
in your browser again and export a fresh copy.

## How it works

- The settings view only asks; main shows the file dialog and reads the file once. Neither the
  path nor any cookie value reaches a renderer, and nothing is copied or kept.
- `src/shared/sign-in-cookies.ts` decides what is taken: `oauth_token` (the sign-in itself,
  required), `oauth_refresh_token` (which renews it) and `_soundcloud_session` (the sign-in
  service's session, on `api-auth.soundcloud.com`, when the export has it), each matched by name
  **and** host. These are the sign-in of a signed-in session, measured 2026-11-11 from cookie
  names and flags only. Each is set host-only and secure, the way SoundCloud sets it, after the
  app's old sign-in is removed, so two accounts never mix. Expired cookies are skipped.
- Everything else stays behind on purpose. `datadome` above all: DataDome gives it to one client,
  and the app presenting a browser's would be exactly the mismatch a bot check looks for.
- This moves a sign-in that already exists. It does not sign in with Google inside the app, and
  SoundCloud may still refuse a moved sign-in; then sign in again in the browser and export afresh.
