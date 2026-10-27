# BetterSoundCloud

A desktop client for SoundCloud — Discord Rich Presence, Last.fm scrobbling, themes,
plugins, synced lyrics.

> **This branch is the v2 rewrite.** v0.7.x lives on `main`. The rewrite exists to fix two
> things that make the current release unusable for many people: tracks that grey out and
> auto-skip, and "we detected unusual activity" blocks on sign-in, liking and following.

## Requirements

- Node.js >= 22.12
- Python with [`castlabs-evs`](https://pypi.org/project/castlabs-evs/) — only for producing
  signed release builds, not for development
- For the Linux `.deb` and `.rpm` (not the AppImage): the packaging tool electron-builder
  downloads needs `libcrypt.so.1`, and the `.rpm` needs `rpmbuild`. On Arch that is
  `pacman -S libxcrypt-compat rpm-tools`; on Debian and Ubuntu, `apt install rpm`

## Getting started

```bash
npm install
npm run dev
```

`npm install` pulls Electron from
[castlabs/electron-releases](https://github.com/castlabs/electron-releases), not npm. That
build installs the Widevine CDM on first launch, which SoundCloud now requires for part of its catalogue, and
it is where the `components` export used in `src/main/index.ts` comes from.

The first launch of each profile waits for that download before opening a window. This
can take a few minutes on a slow connection; subsequent launches use the installed CDM.

> **Why there is a `postinstall` script.** The Castlabs package ships no `scripts` field,
> so unlike the stock `electron` package it has no `postinstall` to fetch the binary. Left
> alone you get an empty `node_modules/electron` with no `dist/` and no `path.txt`, and
> every tool fails with `Error: Electron uninstall` — this is issue
> [#99](https://github.com/AlirezaKJ/BetterSoundCloud/issues/99). Our `postinstall` runs
> the vendored `install.js` to fix it. If you ever install with `--ignore-scripts`, run
> `node node_modules/electron/install.js` by hand.

On Linux, the Vite config clears an inherited `CHROME_DESKTOP` before launching
Electron. Without this, starting from an Electron-based terminal such as VS Code or
Orca can crash in `zygote_host_impl_linux.cc` before the app runs
([Castlabs #165](https://github.com/castlabs/electron-releases/issues/165)). For direct
Electron launches, use `env -u CHROME_DESKTOP node_modules/.bin/electron .`.

## Scripts

| Command                                          | What it does                                               |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `npm run dev`                                    | electron-vite dev server with renderer HMR                 |
| `npm run check`                                  | `tsc` (both projects) + `svelte-check` + ESLint + Prettier |
| `npm test`                                       | Vitest                                                     |
| `npm run pack`                                   | Unpacked build into `release/`                             |
| `npm run dist:win` \| `dist:mac` \| `dist:linux` | Installers                                                 |

`tsc --noEmit` does not look inside `.svelte` files, which is why `npm run check` runs
`svelte-check` as well. Run `check` before pushing; CI runs it before it builds.

Dev runs from its own profile (`%APPDATA%/BetterSoundCloud (dev)`), so a `npm run dev`
instance and an installed build do not share settings or fight over the single-instance
lock. If you launch the installed app while dev is running it will still exit immediately
— that is the lock working, not a crash.

## Release builds and VMP signing

**Development does not need any of this.** It is required only to produce a build that can
play SoundCloud's DRM-protected tracks.

A Castlabs prebuilt carries only a _development_ Widevine signature, and production licence
servers reject development clients. Without the signing step below, an installed build looks
completely normal but greys out and skips DRM tracks — this is the v0.7.1 bug behind issues
[#95](https://github.com/AlirezaKJ/BetterSoundCloud/issues/95) and
[#105](https://github.com/AlirezaKJ/BetterSoundCloud/issues/105).

One-time setup:

1. Install Python 3 and make sure `py`, `python3`, or `python` runs.
2. `pip install --upgrade castlabs-evs`
3. Create a free Castlabs EVS account: `python -m castlabs_evs.account signup`
   (already have one? `python -m castlabs_evs.account reauth`)

Then build:

```
set STRICT_VMP_SIGNING=true
npm run dist:win
```

`STRICT_VMP_SIGNING=true` makes the build **fail** if it cannot sign. Always set it for
releases — the default is deliberately fail-open so contributors without an EVS account can
still build locally, and a release that silently skipped signing is exactly the bug we are
trying to stop shipping.

The signing script searches for `py`, `python3`, then `python`. Set `EVS_PYTHON` to an
interpreter path to override that — useful with a virtualenv.

Signing happens at a different point per platform, which is why there are two hook files:
`scripts/vmp-after-pack.js` (macOS, before code signing) and `scripts/vmp-after-sign.js`
(Windows, after). Both call `signPackage()` in `scripts/vmp-sign.js`. Linux needs no VMP
signature.

### Releases are built by GitHub Actions

Pushing a tag `v<version>` (it must match `package.json`, e.g. `v2.0.0-alpha.0`) runs
[`.github/workflows/release.yml`](.github/workflows/release.yml). It runs the checks, builds the
Windows installer and portable build (VMP-signed, with `STRICT_VMP_SIGNING=true`) and the Linux
AppImage, `.deb` and `.rpm`, confirms Electron's fuses are set (`scripts/verify-fuses.mjs`), and
puts every file plus `SHA256SUMS.txt` in a **draft** release. Nothing is public until you publish
the draft. Versions with a suffix (`-alpha.0`) are marked as pre-releases. macOS is not built
until notarization is funded.

It needs two repository secrets, your Castlabs EVS login: `EVS_ACCOUNT_NAME` and `EVS_PASSWD`
(`gh secret set EVS_ACCOUNT_NAME`, then `gh secret set EVS_PASSWD`; each asks for the value).
Without them the Windows job stops at its first step.

Test the draft's files before publishing: run `npm run smoke:packaged -- <path to the exe>` and work
through [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).

> **`requestMediaKeySystemAccess()` is not a test for this.** It is a local capability
> probe that never contacts a licence server, so it succeeds on an unsigned build. The only
> real test is playing a track that is known to fail.

## Layout

```
src/
├── main/        Electron main process — windows, session, settings, services
├── preload/     chrome.ts (our own UI) · content.ts (soundcloud.com, read-only)
├── renderer/    Svelte 5 — the 32px header, the settings panel, the right-click menu, overlays
└── shared/      Types, IPC channel names, the settings schema
resources/       Bundled themes and plugins, read in place; user copies go in userData
scripts/         VMP signing
```

## Rules this codebase is built around

These are not style preferences. Each one is a bug we already shipped.

1. **One user agent, set once, at the lowest layer.** `app.userAgentFallback` before
   `whenReady()`, derived from `process.versions.chrome`. No header rewriting, no JS
   property spoofing, and no touching `sec-ch-ua` — Chromium's own client hints then agree
   with it. v0.7.1 rewrote only the header, so its sign-in request described one browser in
   its headers and a different one in its body.
2. **Never write into SoundCloud's DOM.** No `innerHTML` on existing nodes, no insertion
   into React containers, no `.remove()`. Cosmetic changes are CSS-only via `insertCSS`.
   Our chrome is a separate view stacked above the page, which is what makes this rule
   affordable.
3. **No polling on the SoundCloud origin, ever.** MutationObserver and `addEventListener`
   only. ESLint enforces this.
4. **No synthetic clicks on SoundCloud's controls.** Media keys are handled by
   SoundCloud's own Media Session handlers.
5. **Take the session by reference off the view you created.** Never `session.defaultSession`
   and never a partition string.
6. **Nothing is loaded from a CDN at runtime.** Every renderer ships a CSP that forbids it.

The reasoning behind each, with issue references, is in the project vault under
"BetterSoundCloud v2 Tech Stack and Approach".

## Licence

MIT — see [LICENSE](LICENSE).
