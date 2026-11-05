# Contributing to BetterSoundCloud

Thank you for helping. Bug reports, fixes, themes and plugins are all welcome. This page covers
building the app from source, the rules every change is checked against, and how a release is
made. [CLAUDE.md](CLAUDE.md) is the full map of the code: where each piece lives, how the views fit
together, and the bug behind each rule below.

## Requirements

- Node.js >= 22.12
- Python with [`castlabs-evs`](https://pypi.org/project/castlabs-evs/), but only for producing
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
[castlabs/electron-releases](https://github.com/castlabs/electron-releases), not npm. That build
installs the Widevine CDM on first launch, which SoundCloud requires for part of its catalogue, and
it is where the `components` export used in `src/main/index.ts` comes from.

The first launch of each profile waits for that download before opening SoundCloud. This can take
a few minutes on a slow connection; later launches use the installed CDM.

> **Why there is a `postinstall` script.** The Castlabs package ships no `scripts` field, so unlike
> the stock `electron` package it has no `postinstall` to fetch the binary. Left alone you get an
> empty `node_modules/electron` with no `dist/` and no `path.txt`, and every tool fails with
> `Error: Electron uninstall`: this is issue
> [#99](https://github.com/AlirezaKJ/BetterSoundCloud/issues/99). Our `postinstall` runs the
> vendored `install.js` to fix it. If you ever install with `--ignore-scripts`, run
> `node node_modules/electron/install.js` by hand.

On Linux, the Vite config clears an inherited `CHROME_DESKTOP` before launching Electron. Without
this, starting from an Electron-based terminal such as VS Code or Orca crashes in
`zygote_host_impl_linux.cc` before the app runs
([Castlabs #165](https://github.com/castlabs/electron-releases/issues/165)). For direct Electron
launches, use `env -u CHROME_DESKTOP node_modules/.bin/electron .`.

**Dev runs from its own profile** (`%APPDATA%/BetterSoundCloud (dev)` on Windows), so a
`npm run dev` instance and an installed build do not share settings. Main and preload code do not
hot-reload: restart `npm run dev` after changing them. If a second `npm run dev` starts on port 5174
instead of 5173, an old one is still running and holds the lock, and the new Electron exits
quietly.

## Scripts

| Command                                          | What it does                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                    | electron-vite dev server, with hot reload for the views                                                     |
| `npm run check`                                  | The Electron pin check, `tsc` over four projects, `svelte-check`, ESLint and Prettier                       |
| `npm test`                                       | Vitest, once                                                                                                |
| `npm run build`                                  | `check`, then a production build into `out/`                                                                |
| `npm run pack`                                   | An unpacked app in `release/`                                                                               |
| `npm run dist:win` \| `dist:mac` \| `dist:linux` | Installers (see "Release builds" for the signing they need)                                                 |
| `npm run smoke:packaged`                         | Starts a packed build on a brand-new profile and checks it ([release checklist](docs/RELEASE_CHECKLIST.md)) |
| `npm run blocker:build`                          | Rebuilds the ad-block engine in `resources/`; commit both files it writes                                   |
| `npm run todo`                                   | Opens the backlog, [docs/TODO.md](docs/TODO.md), as a page to read at a glance                              |

`tsc --noEmit` does not look inside `.svelte` files, which is why `npm run check` runs
`svelte-check` as well. The pin check (`scripts/verify-electron.mjs`) makes sure the lockfile
installs the same Castlabs Electron that `package.json` names; a mismatch once made every bug
report impossible to reproduce.

## Before you open a pull request

Run `npm run check` and `npm test`; CI runs both. `npx prettier --write <files>` fixes formatting.
Then check your change against the rules below. They are not style preferences: each is a bug the
project already shipped, and a pull request that breaks one will be asked to change, with this
section as the reason.

The posture behind all of them is **parity, not evasion**: the app should look to SoundCloud
exactly like the browser it is, and never pretend to be something else or act for the user. So
region bypass, captcha solving and rate-limit workarounds are out of scope, however they are built.

1. **One user agent, set once, at the lowest layer.** `app.userAgentFallback` before
   `whenReady()`, derived from `process.versions.chrome`. No header rewriting, no JavaScript
   property spoofing, and no touching `sec-ch-ua`, so Chromium's own client hints agree with it.
   v0.7.1 rewrote only the header, so its sign-in request described one browser in its headers and
   a different one in its body. Claiming the Google Chrome brand in `sec-ch-ua` is out for good:
   Electron has no way to make `navigator.userAgentData.brands` say the same, so the claim would
   itself be the contradiction a bot check looks for.
2. **Never write into SoundCloud's page.** No `innerHTML` on existing nodes, no insertion into its
   containers, no `.remove()`. Cosmetic changes are CSS only, through `insertCSS`. Our own controls
   are separate views stacked above the page, which is what makes this rule affordable.
3. **No polling on SoundCloud's page, ever.** `MutationObserver` and event listeners only; ESLint
   and a test enforce it.
4. **No synthetic clicks or key presses on SoundCloud's controls**, and that includes
   `sendInputEvent`, which can make a fake event look trusted. They are implicated in the like and
   follow blocks ([#75](https://github.com/AlirezaKJ/BetterSoundCloud/issues/75),
   [#91](https://github.com/AlirezaKJ/BetterSoundCloud/issues/91)).
5. **Take the session by reference off the view you created.** Never `session.defaultSession`, and
   never a partition string: either one silently detaches the hardening from the real session.
6. **Nothing is loaded from the network into our own views.** Every view ships a Content Security
   Policy that forbids remote scripts, styles and fonts.

CLAUDE.md has the rest: the content preload's contract (§7), identity and the session (§10), and
the full list of what is never allowed and why (§14).

## Where things are

```
src/
├── main/          Electron main process: the window and its views, the session, settings, IPC, services
├── preload/       chrome.ts (our own views) · content.ts (soundcloud.com, read-only)
├── renderer/      Svelte 5, one folder per view: the 32px bar, settings, the menu, lyrics, …
└── shared/        Pure TypeScript used by all three: types, IPC channel names, the settings schema
resources/         Shipped with the app: the ad-block engine, the built-in themes and plugins
build-resources/   The Windows icon, the macOS entitlements, the Windows installer's extra script
scripts/           Release tooling: VMP signing, the packaged smoke check, the fuse and Electron checks
docs/              The backlog, the design system, and the guides for theme and plugin authors
```

Theme authors: [docs/CUSTOM_THEMES.md](docs/CUSTOM_THEMES.md). Plugin authors:
[docs/CUSTOM_PLUGINS.md](docs/CUSTOM_PLUGINS.md). What is planned, and what was decided against:
[docs/TODO.md](docs/TODO.md).

## Release builds and VMP signing

**Development does not need any of this.** It is required only to produce a build that can play
SoundCloud's DRM-protected tracks.

A Castlabs prebuilt carries only a _development_ Widevine signature, and production licence
servers reject development clients. Without the signing step below, an installed build looks
completely normal but greys out and skips DRM tracks: this is the v0.7.1 bug behind issues
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

`STRICT_VMP_SIGNING=true` makes the build **fail** if it cannot sign. Always set it for releases.
The default is deliberately fail-open so contributors without an EVS account can still build
locally, and a release that silently skipped signing is exactly the bug we are trying to stop
shipping.

The signing script searches for `py`, `python3`, then `python`. Set `EVS_PYTHON` to an interpreter
path to override that, which is useful with a virtualenv.

Signing happens at a different point per platform, which is why there are two hook files:
`scripts/vmp-after-pack.js` (macOS, before code signing) and `scripts/vmp-after-sign.js`
(Windows, after). Both call `signPackage()` in `scripts/vmp-sign.js`. Linux needs no VMP
signature.

> **`requestMediaKeySystemAccess()` is not a test for this.** It is a local capability probe that
> never contacts a licence server, so it succeeds on an unsigned build. The only real test is
> playing a track that is known to fail.

### Releases are built by GitHub Actions

Pushing a tag `v<version>` (it must match `package.json`, e.g. `v0.8.0`) runs
[`.github/workflows/release.yml`](.github/workflows/release.yml). It runs the checks, builds the
Windows installer and portable build (VMP-signed, with `STRICT_VMP_SIGNING=true`) and the Linux
AppImage, `.deb` and `.rpm`, confirms Electron's fuses are set (`scripts/verify-fuses.mjs`), and
puts every file plus `SHA256SUMS.txt` in a **draft** release. Nothing is public until you publish
the draft. Versions with a suffix (`0.9.0-beta.1`) are marked as pre-releases. macOS is not built
until notarization is funded.

It needs two repository secrets, your Castlabs EVS login: `EVS_ACCOUNT_NAME` and `EVS_PASSWD`
(`gh secret set EVS_ACCOUNT_NAME`, then `gh secret set EVS_PASSWD`; each asks for the value).
Without them the Windows job stops at its first step.

Test the draft's files before publishing: run `npm run smoke:packaged -- <path to the exe>` and work
through [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).
