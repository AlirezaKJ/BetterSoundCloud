# Release checklist

Before every tag, not once. The bugs this project exists to fix — tracks that grey out and skip
(#95, #105), sign-in blocks (#93, #97) — only exist in the packaged, fused and signed artifact, so
every check here runs against that artifact, never against `npm run dev`.

## 1. Build and sign

Set `version` in `package.json`, commit, then push a matching tag:

```
git tag v0.8.0
git push origin v0.8.0
```

`.github/workflows/release.yml` builds Windows and Linux and drafts the release. In the run's log,
the Windows job must show `[vmp] Signature verified.`, and both build jobs must show `PASS` for
every fuse. The draft holds the installer (`…-setup.exe`), the portable build (`…-portable.exe`),
the AppImage, `.deb` and `.rpm`, the update feeds (`latest.yml`, `latest-linux.yml`) and
`SHA256SUMS.txt`. Download them from the draft.

If the workflow cannot run, build Windows by hand, from a shell with your Castlabs EVS login current
(`py -m castlabs_evs.account reauth` if it has lapsed — signing needs it, and it lapses):

```
set STRICT_VMP_SIGNING=true
npm run dist:win
py -m castlabs_evs.vmp verify-pkg release\win-unpacked
```

`verify-pkg` must say the signature is valid for `streaming`.

## 2. The automated smoke check

```
npm run smoke:packaged -- <path to the downloaded …-portable.exe>
```

(With no path it uses `release/win-unpacked`, the output of a build by hand.) It launches the packed app on a brand-new profile (yours is never touched) and checks, in about a
minute: the window and SoundCloud load; Widevine installs; the page sees nothing of ours; the user
agent and its client hints do not name the app; every built-in theme, the Last.fm plugin and Discord
presence load from inside the archive; themes, the background and Minimal navigation apply; our
views throw no errors; closing the window quits. Every line must say PASS. It signs nothing in and
plays nothing.

## 3. By hand

These need a person, real credentials and a real ear. Use a dedicated test account where you can:
repeated sign-ins are themselves something SoundCloud's bot check notices, so cap the attempts, and
when one is refused, write down what SoundCloud said rather than retrying.

- [ ] Install the NSIS installer on a machine (or a Windows user) that has never run BetterSoundCloud.
      On a machine that has, run the portable build with `--user-data-dir=<an empty folder>` instead:
      v0.7.x and v2 share `%APPDATA%\BetterSoundCloud`, and a fresh profile is the point of the test.
- [ ] Upgrade on Windows: on a machine where v0.7.x is installed and signed in, from its Setup.exe or
      its MSI, install this version and launch it. It should open signed in, because it uses the same
      profile folder, and v0.7.x should be gone from Settings → Apps, with one BetterSoundCloud in
      the Start Menu (build-resources/installer.nsh removes it; the MSI asks for admin approval).
      The removal was measured 2026-10-29; signed in after a real upgrade is not yet seen.
- [ ] Taskbar on Windows: pin BetterSoundCloud from the Start Menu, then let the update below restart
      it. There must be one taskbar button, still pinned, not the pin plus a second one. (The app
      sets the app ID the installer stamps on its shortcuts, `appId` in electron-builder.yml.) Pin
      after installing, not before: running an installer by hand over an existing install removes
      the pin, an update does not.
- [ ] Updating, once the release is published (the updater reads published releases only): on a
      machine with the previous version's installer build, turn Windows' Do Not Disturb off, start
      it, and leave Settings closed (no notification is sent while Settings is open, and Do Not
      Disturb hides it). Within a minute a notification says the new version is ready, and the line
      under Settings → General → "Update automatically" says so too. "Restart now" must bring the
      app back as the new version (the same line then says "Up to date"), still signed in, and still
      playing a protected track. Then
      `py -m castlabs_evs.vmp verify-pkg "%LOCALAPPDATA%\Programs\BetterSoundCloud"` must still say
      valid for `streaming`: Windows downloads only the changed blocks and rebuilds the installer
      from them. Do the same with the previous AppImage on Linux. The portable build must say the
      version is available and open its release page instead.
- [ ] The release notes say that on Linux, people coming from v0.7.x start signed out and with default
      settings. v0.7.x kept its profile in `~/.config/bettersoundcloud` and v2 keeps it in
      `~/.config/BetterSoundCloud`; nothing is copied across, on purpose (see `app.setName` in
      `src/main/index.ts`).
- [ ] Sign in from the fresh profile. No challenge, no "unusual activity".
- [ ] Play ten tracks from a large playlist, **including one that greys out and skips on v0.7.1** —
      the only real test of the VMP signature (`requestMediaKeySystemAccess` succeeds even unsigned).
- [ ] Like a track and follow a user. Both stick after a reload.
- [ ] Turn on Last.fm, connect it, and see the track scrobble on last.fm.
- [ ] Discord shows the track while it plays.
- [ ] Pick each built-in theme with SoundCloud in its light mode and its dark mode.
- [ ] The portable build too: it unpacks to a new temporary folder on every launch, so the archive's
      integrity check and the `.sig` signature files must survive being moved.
- [ ] Not possible yet: Castlabs' VMP lab page, which would confirm the licence server sees
      `PLATFORM_SOFTWARE_VERIFIED` (stronger than `verify-pkg`). The app sends every page that is not
      SoundCloud to the system browser, so it cannot be opened inside the app; it needs a test-only
      way in first.

## 4. Publish

Paste this version's entry from `CHANGELOG.md` into the draft's notes, under the checksums the
workflow wrote, and change "(not released yet)" in its heading to the date. Add anything above that
the release notes must say and the entry does not yet. The workflow writes only the checksums and
GitHub's list of merged changes. Read the README against
the release too: its download table, "What's new", "Not back yet" and "Known issues" must be true
of the version being published: it is the project's front page on GitHub. Then press
Publish. If a check failed, delete the draft (and the tag, if it was pushed) instead, fix it, and
tag again.
