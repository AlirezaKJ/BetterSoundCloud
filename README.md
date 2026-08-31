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

## Getting started

```bash
npm install
npm run dev
```

`npm install` pulls Electron from
[castlabs/electron-releases](https://github.com/castlabs/electron-releases), not npm. That
build ships the Widevine CDM, which SoundCloud now requires for part of its catalogue, and
it is where the `components` export used in `src/main/index.ts` comes from.

> **Why there is a `postinstall` script.** The Castlabs package ships no `scripts` field,
> so unlike the stock `electron` package it has no `postinstall` to fetch the binary. Left
> alone you get an empty `node_modules/electron` with no `dist/` and no `path.txt`, and
> every tool fails with `Error: Electron uninstall` — this is issue
> [#99](https://github.com/AlirezaKJ/BetterSoundCloud/issues/99). Our `postinstall` runs
> the vendored `install.js` to fix it. If you ever install with `--ignore-scripts`, run
> `node node_modules/electron/install.js` by hand.

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

## Layout

```
src/
├── main/        Electron main process — windows, session, settings, services
├── preload/     chrome.ts (our own UI) · content.ts (soundcloud.com, read-only)
├── renderer/    Svelte 5 — the 32px header and the settings panel
└── shared/      Types, IPC channel names, the settings schema
resources/       Bundled themes and plugins, seeded into userData on first launch
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
