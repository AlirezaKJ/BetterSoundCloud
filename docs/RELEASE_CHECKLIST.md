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
- [ ] Upgrade on Windows: on a machine where v0.7.x is installed and signed in, install v2 and launch
      it. It should open signed in, because it uses the same profile folder. Not yet seen on a real
      upgrade.
- [ ] Taskbar on Windows: pin BetterSoundCloud from the Start Menu, quit it, start it from the pin.
      There must be one taskbar button, not the pin plus a second one. (The app and the installer's
      shortcuts share one app ID, `appId` in electron-builder.yml.)
- [ ] Updating, once the release is published (the updater reads published releases only): on a
      machine with the previous version's installer build, start it and wait. Within a minute the
      line under Settings → General → "Update automatically" says the new version is downloading,
      then ready, and a notification says so. "Restart now" must bring the app back as the new
      version (the same line then says "Up to date"), still signed in, and still playing a protected
      track. Do the same with the previous AppImage on Linux. The portable build must say the version
      is available and open its release page instead.
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

Edit the draft's notes: what changed, and anything above that the release notes must say. The
workflow writes only the checksums and GitHub's list of merged changes. Then press Publish. If a
check failed, delete the draft (and the tag, if it was pushed) instead, fix it, and tag again.
