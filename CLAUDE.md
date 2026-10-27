# CLAUDE.md

BetterSoundCloud v2: a desktop client that wraps soundcloud.com in Electron and adds what a
browser tab cannot. This branch (`rewrite`) is a full rewrite; v0.7.x lives on `main`.
The two bugs the rewrite exists to fix: DRM tracks that grey out and auto-skip (fixed by VMP
signing), and "unusual activity" blocks on sign-in, like and follow (still open).

**Keep this file current.** When a change adds or alters a view, an IPC method or channel, a
module, a pattern or a rule described here, update this file in the same change. A stale
CLAUDE.md is worse than none, because it gets trusted.

---

## 1. Commands

| Command                        | What it does                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `npm run dev`                  | electron-vite dev server, renderer HMR. Main and preload do NOT hot-reload — restart after changing them |
| `npm run check`                | `tsc` ×3 (node, preload, web) + `svelte-check` + ESLint + Prettier check. Run before calling work done   |
| `npm test`                     | Vitest, once                                                                                             |
| `npm run build`                | `check` then `electron-vite build` into `out/`                                                           |
| `npm run pack`                 | Unpacked app into `release/`                                                                             |
| `npm run dist:win` etc.        | Installers. Release builds need `STRICT_VMP_SIGNING=true` (see README)                                   |
| `npm run blocker:build`        | Recompile `resources/engine.bin` + `engine.meta.json`; commit both                                       |
| `npx prettier --write <files>` | Fix formatting before `check`                                                                            |

- Dev runs from its own profile, `%APPDATA%/BetterSoundCloud (dev)`, set in `src/main/index.ts`.
- **A stale `npm run dev` holds the single-instance lock.** A second one starts on port 5174 and
  its Electron exits silently, leaving the old main-process code running. Check for a listener on
  5173 and running `electron.exe` processes before assuming a build is live.
- `npm install` needs `allow-git=root` (in `.npmrc`) because Electron comes from the Castlabs
  GitHub release (Widevine build). `postinstall` fetches the binary.

---

## 2. Stack

TypeScript strict · Electron (Castlabs Widevine build, `components.whenReady()` before any window)
· Svelte 5 with runes, plain Svelte (no SvelteKit) · electron-vite 5 / Vite 7 · electron-builder ·
electron-store · Vitest (node environment) · ESLint (type-aware) · Prettier.

Path aliases `@shared/*` → `src/shared/*` and `@renderer/*` → `src/renderer/*`. They are declared in
three places that must agree: `tsconfig.base.json`, `electron.vite.config.ts` (per target),
`vitest.config.ts` (`@shared` only).

---

## 3. Layout of the source

```
src/main/       Electron main process. ESM. Owns windows, views, session, settings, IPC.
src/preload/    chrome.ts   -> window.bsc for OUR views (contextBridge)
                content.ts  -> soundcloud.com's page, isolated world, exposes NOTHING
                soundcloud-selectors.ts -> every SoundCloud class name we read
src/renderer/   Svelte 5. One folder per view, each with index.html + main.ts + Component.svelte.
                tokens.css (design tokens), lib/ (shared components)
src/shared/     Pure TypeScript shared by main, preload and renderer. No Electron, no DOM.
resources/      Shipped at runtime: engine.bin (ad blocker), themes/, icon.png
scripts/        Blocker engine build, VMP signing hooks
docs/           TODO.md (the backlog), DESIGN.md (design system), PRODUCT.md
```

### Key main-process files

| File                               | Owns                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main/index.ts`                    | Startup order, the Widevine wait, single-instance lock, `registerIpc()` (every IPC handler and its sender check), `applyLiveSettings()`, broadcasts |
| `main/window.ts`                   | `Shell` type, `createShell()`, `layout()`, every overlay view, `applyContentCss()`, `rendererUrl()`, `enableDevToolsShortcut()`                     |
| `main/context-menu.ts`             | The right-click menu view and every menu action                                                                                                     |
| `main/page-status.ts`              | The page-status view: failed loads (and their retries), crashes, hangs, slow starts, and its buttons                                                |
| `main/now-playing.ts`              | The one copy of "what is playing": `getNowPlaying`, `setNowPlaying`, `onNowPlayingChange`                                                           |
| `main/session.ts`                  | `hardenSession`, permission allowlist, `routeNewWindowsToBrowser`, `isInternalUrl`, `openInBrowser`                                                 |
| `main/settings-store.ts`           | electron-store wrapper: `get`, `getAll`, `set`, `reset`. Lazy — built on first use                                                                  |
| `main/content-css.ts`              | `buildContentCss()`: the one stylesheet injected into SoundCloud's page (pure, tested)                                                              |
| `main/themes.ts`                   | `listThemes()`, `themeCss()`; reads `resources/themes/` and `<userData>/themes/`                                                                    |
| `main/blocker.ts` + `net-rules.ts` | Ad/tracker blocking and the never-filter allowlist                                                                                                  |
| `main/diagnostics.ts`              | Dev-only network and page-error log, `whoAnswered()` (SoundCloud vs DataDome)                                                                       |
| `main/tray.ts`                     | Tray icon and menu (playback items disabled until playback control exists)                                                                          |
| `main/go-to-url.ts`                | `resolveGoToUrl()` for the menu's "Go to URL" prompt                                                                                                |
| `main/env.ts`                      | `isDev`                                                                                                                                             |

### Key shared files

| File                        | Owns                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `shared/ipc.ts`             | `CH` (every channel name), `ChromeApi` (the `window.bsc` type), `NavState`, `WindowState`               |
| `shared/settings-schema.ts` | `SETTINGS`, `SECTIONS`, `Settings`, `SettingKey`, `coerce`, `coerceAll`, `defaults`                     |
| `shared/now-playing.ts`     | `PlayerReading`, `NowPlaying`, `readNowPlaying()` and its cleaners                                      |
| `shared/page-theme.ts`      | `PageTheme`, `detectPageTheme()`                                                                        |
| `shared/context-menu.ts`    | `ContextMenuRequest`, `CONTEXT_MENU_ACTIONS`, `cleanUrl`, `shortUrl`, `elide`                           |
| `shared/page-status.ts`     | `PageStatus`, `describePageStatus()` (every word on that view), `describeLoadFailure()`, `retryDelay()` |
| `shared/themes.ts`          | `ThemeSummary`, `parseThemeMetadata()`                                                                  |
| `shared/identity.ts`        | `Identity`, `buildUserAgent()`, `leaksAppIdentity()`, `pageLanguages()`, `acceptLanguages()`            |

---

## 4. The window: one BaseWindow, stacked views

There is no BrowserWindow. `createShell()` builds a frameless `BaseWindow` and stacks
`WebContentsView`s in it. Our UI is never injected into SoundCloud's page; it is drawn in separate
views composited above it. Everything is held on the `Shell` object (`src/main/window.ts`).

| `Shell` field | Renderer entry          | Preload       | Lifetime                                                                                                 |
| ------------- | ----------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `header`      | `renderer/header`       | `chrome.cjs`  | Always. Hidden (`setVisible(false)`) while SoundCloud owns the top                                       |
| `content`     | soundcloud.com          | `content.cjs` | Always. Loads `https://soundcloud.com/discover` once Widevine is ready (`loadSoundCloud`)                |
| `settings`    | `renderer/settings`     | `chrome.cjs`  | Created on open, destroyed on close (`toggleSettings`/`closeSettings`)                                   |
| `embedded`    | `renderer/embedded`     | `chrome.cjs`  | Exists while `appearance.hideMenuBar` is on; window buttons over SoundCloud's header                     |
| `player`      | `renderer/player`       | `chrome.cjs`  | Exists while `appearance.playerButtons` is on; buttons at the right end of SoundCloud's play bar         |
| `contextMenu` | `renderer/context-menu` | `chrome.cjs`  | Created once (`attachContextMenu`), hidden between uses                                                  |
| `status`      | `renderer/status`       | `chrome.cjs`  | Exists while `pageStatus` is set: SoundCloud's page cannot be shown (`showPageStatus`/`clearPageStatus`) |

Rules that hold this together:

- **`layout()` is the only place that decides where views sit** and whether our 32px bar shows.
  Any new view must be positioned from `layout()`. `window.test.ts` scans the source to pin this.
- **Overlays over SoundCloud reserve their space with CSS.** A transparent view on top of
  SoundCloud's controls would leave them visible but dead to clicks, so `applyContentCss` injects
  padding of at least the overlay's width. Reservation and overlay must always agree.
- **Zoom:** the content view is zoomable and our views are not. SoundCloud CSS pixels × zoom =
  window pixels. Measured constants: `HEADER_HEIGHT` 32, SoundCloud header 46 CSS px, play bar
  48 CSS px, `EMBEDDED_WIDTH` 144 (50 on macOS), `PLAYER_BUTTONS_WIDTH` 92, `MIN_EMBED_WIDTH` 800
  (= window `minWidth`), `COMPACT_HEADER_WIDTH` 1100, `FIT_HEADER_WIDTH` 1000.
- **While a page status hides SoundCloud's page, our own bar comes back** and the `embedded` and
  `player` overlays hide: there is no SoundCloud header or play bar under them. `layout()` derives
  this from `hidesPage(shell.pageStatus)`. A hang is the exception — it is a dialog over a page
  that is still there, like settings.
- `BaseWindow` does not own its views: the `closed` handler in `index.ts` closes each view's
  `webContents` explicitly. A new view goes in that list.
- On macOS, closing hides the window to keep playback alive; Quit really quits.

**Startup order** (`index.ts`): IPC, the ad-block engine, then the window — and only then the wait
for Widevine (`components.whenReady()`). `createShell` does not load SoundCloud; `loadSoundCloud`
runs once Widevine is ready, because a page making EME calls before that gets no Widevine and its
protected tracks skip. A view created before Widevine is ready does get it once it navigates
(measured), which is what makes this order safe. If Widevine fails, SoundCloud is never loaded and
the page status says why, with Restart — after one failure every later `whenReady()` returns the
same rejection, so only a relaunch retries it. The window shows when the header paints, or after
3s, a header load failure or a header crash, whichever is first (`showWhenChromeIsReady`): it must
never stay invisible. A failure before any window exists gets `dialog.showErrorBox`.

Every view is created with the same `webPreferences` — copy them, do not loosen them:
`nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: isDev`
(plus `preload`). Then `hardenSession(view.webContents.session, shell.identity)` and
`routeNewWindowsToBrowser(view.webContents)`. Overlays also call
`view.setBackgroundColor('#00000000')`.

---

## 5. IPC and `window.bsc`

All channel names live in `CH` in `src/shared/ipc.ts`. Never write a channel string inline —
with one exception: `src/preload/content.ts` writes its own channel strings as literals, because
importing `@shared/ipc` from both preloads makes Rollup emit a shared chunk that a sandboxed
preload cannot `require`, and the preload then fails to load silently. `content.test.ts` pins the
literals to `CH`. The same applies to any runtime import shared by `chrome.ts` and `content.ts`;
type-only imports are fine.

`window.bsc` (type `ChromeApi`, implemented in `src/preload/chrome.ts`) exists only in our own
views:

| Method                                             | Kind        | Main accepts it from (sender check)                                      |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `platform`                                         | value       | —                                                                        |
| `minimize`, `maximizeToggle`, `close`              | send        | `fromChrome` = header, embedded                                          |
| `back`, `forward`, `reload`                        | send        | `fromChrome`                                                             |
| `toggleSettings`, `toggleMenuBar`                  | send        | `fromChrome`                                                             |
| `closeSettings`                                    | send        | the settings view only                                                   |
| `getSettings`, `setSetting`, `listThemes`          | invoke      | `fromSettingsUi` = header, embedded, settings                            |
| `contextMenuAction`, `goToUrl`, `closeContextMenu` | send/invoke | the context-menu view only                                               |
| `getNowPlaying`                                    | invoke      | `fromOurViews` = header, settings, embedded, player, contextMenu, status |
| `onNavState`                                       | subscribe   | pushed to header                                                         |
| `onWindowState`                                    | subscribe   | pushed to header, embedded                                               |
| `onSettingsChanged`                                | subscribe   | pushed to header, settings (`broadcastSettings`)                         |
| `onPageTheme`                                      | subscribe   | pushed to embedded, player (and on their load)                           |
| `onContextMenu`                                    | subscribe   | pushed to the context-menu view                                          |
| `onNowPlaying`                                     | subscribe   | pushed to all six of our views (`broadcastNowPlaying`)                   |
| `pageStatusAction`                                 | send        | the status view only; re-checked against `shell.pageStatus`              |
| `onPageStatus`                                     | subscribe   | pushed to the status view (on its load and on every change)              |

Every `on…` returns an unsubscribe function. A new view that needs one of the gated methods must
be added to that sender check, and to the matching broadcast list if it needs pushes.

**Adding an IPC capability:**

1. Add the channel(s) to `CH`.
2. Add the method to `ChromeApi` with a doc comment saying what it carries and how often.
3. Implement it in `chrome.ts`: `ipcRenderer.send` / `ipcRenderer.invoke` / `subscribe(channel, cb)`.
4. Register the handler in `registerIpc()` in `index.ts` with a sender check. Treat every payload
   as `unknown` and validate it (`coerce`, `isContextMenuAction`, `readNowPlaying`, …).
5. If main pushes it, broadcast with the `for (const view of [...]) if (view && !isDestroyed()) send`
   pattern.
6. `index.test.ts` mocks views' `webContents` (`isDestroyed`, `close`, `setZoomFactor`, `on`,
   `send`). Calling a new `webContents` method from `index.ts` means adding it to that mock.

---

## 6. Writing a renderer (view)

Each view is `src/renderer/<entry>/{index.html, main.ts, <Name>.svelte}`.

- `main.ts` is always: import `mount` from svelte, import `'../tokens.css'`, find `#app` (throw if
  missing), `mount(Component, { target })`.
- `index.html` carries the CSP — copy it exactly:
  `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'`.
  No remote scripts, styles or fonts, ever. **Artwork from `https://*.sndcdn.com` is blocked by
  this CSP**: a view that shows artwork must add exactly that origin to its own `img-src`, nothing
  broader.
- Svelte 5 runes only: `$state`, `$derived`, `$effect`, `$props`. Event attributes (`onclick`), not
  `on:click`. Subscribe in `onMount` and return the cleanup:

  ```svelte
  <script lang="ts">
    import { onMount } from 'svelte'
    import type { NowPlaying } from '@shared/now-playing'

    let nowPlaying = $state<NowPlaying | null>(null)

    onMount(() => {
      // Subscribe first, then read, so no change can slip between the two.
      const stop = window.bsc.onNowPlaying((np) => (nowPlaying = np))
      void window.bsc.getNowPlaying().then((np) => (nowPlaying = np))
      return stop
    })
  </script>
  ```

- Import shared types with `import type` (ESLint enforces it). Shared runtime helpers from
  `@shared/*` are fine in renderers.
- A view drawn over SoundCloud is transparent all the way down:
  `:global(html), :global(body) { background: transparent; overflow: hidden; }`.
- **Two colour sources.** Our own surfaces (header, settings, menu) follow
  `appearance.colorScheme`, which main applies through `nativeTheme.themeSource`, so tokens.css's
  `prefers-color-scheme` block just works — no IPC. Overlays drawn ON SoundCloud's bars follow
  SoundCloud's own light/dark setting instead: subscribe to `onPageTheme` and switch a class
  (see `Player.svelte`, `Embedded.svelte`). Override tokens locally in that case, e.g.
  `--bsc-bg-hover`.
- Reuse `lib/WindowControls.svelte` for minimize/maximize/close; it hides itself on macOS.
- Dialog-style views close in two steps: set state so the outro plays, then tell main to destroy
  the view on `onoutroend`, with a timer backstop (`Settings.svelte`).

**Adding a new view, end to end:**

1. `src/renderer/<entry>/` with the three files above.
2. Add the HTML to `renderer.build.rollupOptions.input` in `electron.vite.config.ts`.
3. Add the entry name to the `rendererUrl()` union in `window.ts`.
4. Add a `Shell` field, create the view with the standard `webPreferences` (section 4), harden
   its session, load `rendererUrl('<entry>')`.
5. Position it from `layout()`. Close it in the `closed` handler in `index.ts`.
6. Add it to the sender checks and broadcast lists it needs (section 5). If it sits over
   SoundCloud, call `sendPageThemeOnLoad` and include it in `setPageTheme`'s list.
7. In dev, `enableDevToolsShortcut(view)` so F12 works on it.

### Design rules for our UI (full spec: `docs/DESIGN.md`)

- Colour only through `--bsc-*` tokens in `src/renderer/tokens.css`; each is defined for light and
  dark. A literal hex elsewhere is a bug — except `#fff` on the close button's danger hover, and
  overlays that must match SoundCloud's own bar colours.
- Theming contract: `--bsc-*` tokens plus `data-bsc-*` attributes on every themable region are the
  public API for user themes. Add `data-bsc-…` to new regions. Never rely on Svelte's hash classes.
  No Shadow DOM anywhere.
- System font stack only, no webfonts. Nothing larger than 15px. Sizes: 15 title, 14 body, 13
  label, 12 caption, 11 uppercase overline (only for "Not implemented yet").
- Two radii: 6px for controls, 10px for floating surfaces. One shadow
  (`0 12px 40px rgb(0 0 0 / 35%), 0 2px 8px rgb(0 0 0 / 20%)`), only on things that float and take
  input; dialogs add the scrim `rgb(0 0 0 / 45%)`, transient menus do not.
- Chrome buttons: 30×26, transparent at rest, `--bsc-bg-hover` wash on hover, no transition,
  `cursor: default`. Focus: `outline: 2px solid var(--bsc-accent); outline-offset: -2px`.
- Icons: 24-unit viewBox drawn at 15×15, `fill: none`, `stroke: currentcolor`, stroke-width 1.6,
  round caps and joins.
- The accent `#f50` marks state (focus, selected, on), never decoration.
- Motion: dialogs 180ms fly (14px) + fade with `cubicOut`; menus 100ms fade-in, no exit.
  `prefers-reduced-motion` sets durations to 0.
- The 32px bar never grows; new affordances go in settings or an overlay.
- **Say what does not work.** An unbuilt feature renders disabled with "Not implemented yet", never
  as a control that silently does nothing.
- Accessibility target is WCAG 2.2 AA: real `<button>`s (scrims and backdrops too), labels, roles,
  full keyboard operation, visible focus.

---

## 7. SoundCloud's page: the content preload contract

`src/preload/content.ts` is the whole of our presence inside soundcloud.com. Rules, each from a bug
already shipped once:

1. **Never write into SoundCloud's DOM.** No `innerHTML`, `insertAdjacentHTML`, `appendChild`,
   `setAttribute`, `.remove()`, no insertion into their containers. Reading is fine.
2. **Read-only, event-driven, isolated world.** `MutationObserver` and passive capture listeners
   only, through the `observe()` / `listen()` helpers (wrapped in try/catch, torn down on
   `pagehide`). **No polling**: no `setInterval`, no `requestAnimationFrame`, no self-recursive
   `setTimeout`. `content.test.ts` scans for these.
3. **Expose nothing to the page.** No `contextBridge`, no globals — the page must not be able to
   detect us. Results go to main over `ipcRenderer.send`, never `console.log`.
4. **Cosmetic changes are CSS only**, injected by main with `webContents.insertCSS()`
   (`applyContentCss` → `buildContentCss`, re-applied on every load; the selected theme is appended
   last).
5. **No synthetic input on SoundCloud's controls** — no `.click()`, no `dispatchEvent`, no
   `sendInputEvent`. Implicated in the like/follow blocks.

Patterns:

- Every SoundCloud class name we read lives in `src/preload/soundcloud-selectors.ts`
  (`PLAYER_BAR`). A redesign should be a one-file fix there. A stale selector reads as empty and
  the feature goes quiet; nothing throws.
- The preload sends **raw readings**; main interprets them with a pure function in `src/shared/`
  (`detectPageTheme`, `readNowPlaying`) that has unit tests. Keep judgement out of the preload.
- Main validates every message from the page: `fromSoundCloudPage` requires the content view's top
  frame on an https soundcloud.com URL.
- Waiting for an element: observe `document.body` (`childList`, `subtree`) and stop as soon as it
  appears. SoundCloud's player bar (`.playControls`) is drawn after DOMContentLoaded and then
  survives in-app navigation (measured).
- **Page lifecycle.** Watchers are torn down only on a real unload: a `pagehide` that is
  `isTrusted` and not `persisted`. Never act on a lifecycle event without checking `isTrusted` —
  the page can dispatch fake ones, and a single fake `pagehide` once switched every watcher off.
  Electron keeps the back/forward cache off and SoundCloud's pages are `Cache-Control: no-store`
  (both measured), so Back to another document is always a fresh load where the preload runs
  again. Each watcher still returns a `ReportAgain`, which the `pageshow` listener in `start()`
  calls on a genuine restore; a new watcher must return one and be added there.

---

## 8. Now playing

```
content.ts watchPlayer()  --CH.trackUpdate (PlayerReading)-->  index.ts fromSoundCloudPage
  --> readNowPlaying()  --> setNowPlaying()  (main/now-playing.ts)
  --> onNowPlayingChange listeners (main-side consumers)
  --> broadcastNowPlaying() --CH.nowPlayingChanged--> window.bsc.onNowPlaying (our views)
```

- `NowPlaying` = `{ title, artist, url, artwork, elapsed, duration, playing, liked }`. `url` is the
  track page with no query; `artwork` is the 500×500 sndcdn image; `elapsed`/`duration` are whole
  seconds; empty string or 0 when unreadable. `null` means nothing is loaded.
- It updates about once a second while a track plays (the clock ticks). Seeks show up as jumps in
  `elapsed`; there is no separate seek event.
- It resets to `null` on a full page load (`did-navigate`), a renderer crash, and window close.
- Main-side features (tray, Discord, Last.fm) subscribe with `onNowPlayingChange` and read with
  `getNowPlaying`. They never talk to the page themselves.
- Dev log: `[now-playing] playing | Artist — Title | 1:05 / 3:33 | liked | artwork | <url>`, one
  line per change except clock ticks. An empty field there points at a stale selector.
- **Playback control (play/pause/skip from outside the page) does not exist yet** and is an open
  decision — see "Open decisions" in `docs/TODO.md`. Do not pick a mechanism without the
  maintainer.

---

## 9. Settings

`src/shared/settings-schema.ts` is the single source of truth. **Adding a setting is one entry in
`SETTINGS`** — the type, the settings form, defaults and validation all follow.

- Kinds: `boolean`, `number` (`min`, `max`, `step`), `enum` (`options`), `string`.
- `wired: false` while nothing reads the setting yet; the panel shows it disabled with "Not
  implemented yet". When you make main read it, remove `wired: false` and update the pinned list
  in `settings-schema.test.ts`.
- `applies: 'reload' | 'restart'` when the effect is not immediate. Never write timing into `help`
  prose — a test forbids it.
- `optionsFrom: 'themes'` for choices read from disk.
- Main reads with `settings.get(key)` / `getAll()`; writes go through `settings.set`, which
  coerces. Live effects are applied in `applyLiveSettings()` in `index.ts`.
- Renderers read with `getSettings()` + `onSettingsChanged()` and write with `setSetting()`, which
  returns the authoritative snapshot (values come back clamped).
- Secrets (Last.fm, tokens) never go in the settings store; they go through `safeStorage`.

---

## 10. Identity, session and network

- **One user agent, set once, at the lowest layer:** `app.userAgentFallback` before `whenReady()`,
  built from `process.versions.chrome` by `buildUserAgent`. Startup throws if it contains
  "Electron" or "BetterSoundCloud". No header rewriting, no `navigator` overrides, no `sec-ch-ua`
  changes, no `--disable-blink-features`. The posture is **parity, not evasion**: look exactly like
  the browser we are.
- **The whole identity is one `Identity` object** (`src/shared/identity.ts`): user agent, the
  page's language list, and the `Accept-Language` list built from it. `browserIdentity()` in
  `index.ts` builds it once after `whenReady`; `createShell` stores it as `shell.identity` and
  every view's session gets it through `hardenSession`.
- **Languages: the header follows the list, never the reverse.** Electron sets
  `navigator.languages` itself (app locale, then the OS languages) and no supported API changes
  it, so `pageLanguages()` recomputes that list and `acceptLanguages()` expands it the way Chrome
  does (`en-US,en-AU,fa` → `en-US,en-AU,en,fa`; Chromium adds the q-values). Both rules are
  pinned by tests built from real Chrome measurements. Dev builds warn at startup if
  `navigator.languages` ever stops matching the list the header was built from.
- Take a session **by reference off the view you created** (`view.webContents.session`). Never
  `session.defaultSession`, never a partition string.
- Permissions are default-deny with an allowlist; `mediaKeySystem` (Widevine) must stay on it.
- New windows and off-site navigations go to the system browser (`routeNewWindowsToBrowser`);
  `openInBrowser` only ever opens http(s).
- Electron allows **one listener per `webRequest` event per session**, and a second registration
  silently replaces the first. `blocker.ts` owns `onBeforeRequest`; dev diagnostics own
  `onCompleted` and `onErrorOccurred`. Extend those, never register another.
- Ad blocking: `resources/engine.bin`, loaded synchronously. `neverFilter()` runs before the
  engine; sign-in, DataDome, reCAPTCHA, playback and SoundCloud's own hosts are never filtered.
  Audio ads (`isAudioAdRequest`) have their own setting. The filter-list blocker is off by default.
- Do not send deliberately bot-like requests to SoundCloud from a developer's machine while
  testing; it can hurt that IP's standing with SoundCloud's bot check.

---

## 11. Dev diagnostics

Dev builds log to the terminal running `npm run dev`. Tags:

| Tag                                                                  | Meaning                                                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[bsc]`                                                              | Chromium version, user agent and language list at startup; a warning if `navigator.languages` and the header disagree                                           |
| `[net]`                                                              | A failed request: status, method, layer (`stream`/`licence`/`api`/`auth`/`other`), URL, and who answered (`from SoundCloud: server am/2`, `from CloudFront`, …) |
| `[datadome]`                                                         | `blocked …` — SoundCloud's bot check refused a request; `challenge shown` — a captcha page loaded                                                               |
| `[page]`                                                             | A console error from SoundCloud's page                                                                                                                          |
| `[now-playing]`                                                      | Track, play/pause and like changes                                                                                                                              |
| `[widevine]`                                                         | How long the Widevine wait took, or why it failed                                                                                                               |
| `[page-status]`                                                      | What the status view is saying (`load failed -106 ERR_INTERNET_DISCONNECTED`, `cleared`, …)                                                                     |
| `[content]`, `[window]`                                              | A failed SoundCloud load; the window shown without its header                                                                                                   |
| `[theme]`, `[player]`, `[context-menu]`, `[blocker]`, `[ad-request]` | Their features                                                                                                                                                  |

F12 or Ctrl/Cmd+Shift+I opens DevTools for the focused view (header, content, settings and
context menu have the shortcut; embedded and player do not).

---

## 12. Code style

- **Readable over clever.** Drive-by contributors read this code. Prefer a plain function, an `if`
  or a small duplicated block over an abstraction. Keep types boring; conditional or mapped types
  need a comment saying why nothing simpler works.
- **Comments explain why**, and usually name the bug or measurement behind a rule. When a value
  was measured on the live site, say so.
- TypeScript is strict, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax` (use `import type`), `noUnusedLocals/Parameters`, `noImplicitReturns`.
- Prettier: no semicolons, single quotes, no trailing commas, print width 96. LF line endings
  everywhere (`.gitattributes`).
- Treat every IPC payload and every reading from SoundCloud's page as hostile `unknown` and
  validate it in a pure, tested function.
- Logging that is only useful while developing goes behind `isDev`.

---

## 13. Testing

- Vitest runs in **node**, over `src/**/*.test.ts`. Anything that imports Electron at runtime
  cannot be loaded, so:
  - put logic in pure modules (`src/shared/*`, `content-css.ts`, `net-rules.ts`, …) and test those;
  - pin structure with source-scanning tests (`content.test.ts`, `window.test.ts`);
  - or mock `electron` and the main modules, as `index.test.ts` does for startup, the window
    lifecycle and the now-playing IPC path.
- `content.test.ts` also checks that `out/preload` holds exactly `chrome.cjs` and `content.cjs`
  (no shared chunk) when a build exists — run `npx electron-vite build` after touching preloads.
- **Renderers in a browser:** open `http://localhost:5173/<entry>/index.html` from the dev server,
  define a mock `window.bsc`, then `await import('/<entry>/main.ts?remount=1')` to mount against
  the mock. Note that synthetic Enter does not submit forms there; use `form.requestSubmit()`.
- **Main-process paths in the real app** are verified from the dev log tags above.
- **Live page behaviour** can be measured with a throwaway Electron script run by
  `node_modules/electron/dist/electron.exe`, outside the repo, using its own `userData` and the
  same user agent rule. SoundCloud now requires sign-in before anything plays, so anything that
  needs a playing track has to be checked in the developer's own dev app.

---

## 14. Not allowed, and why

| Never                                                             | Because                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| Writes into SoundCloud's DOM                                      | Breaks on their releases; DOM changes are detectable |
| Polling on the SoundCloud origin                                  | Detectable timers; past cause of breakage            |
| Synthetic clicks / `sendInputEvent` on SoundCloud controls        | Implicated in like/follow blocks                     |
| Spoofing UA, client hints, `navigator.webdriver`, `window.chrome` | Creates contradictions a bot check sees              |
| Globals or `contextBridge` in the content preload                 | Lets the page detect the client                      |
| Remote code or fonts in our views                                 | CSP forbids it; nothing loads from a CDN at runtime  |
| `session.defaultSession` or partition strings                     | Silently detaches hardening from the real session    |
| A second `webRequest` listener for the same event                 | Silently replaces the first                          |
| Region bypass, captcha solving, rate-limit evasion                | Out of scope: parity, not evasion                    |
| AI / ML features                                                  | Explicitly declined                                  |

---

## 15. Where to look

- `docs/TODO.md` — the working backlog: milestones in order, "Open decisions" (maintainer's call;
  do not invent answers), "Explicitly declined" (do not re-propose).
- `docs/DESIGN.md` — the full design system. `docs/PRODUCT.md` — users, purpose, principles.
- `README.md` — setup, VMP signing for release builds, platform notes.
- Themes: `resources/themes/minimal-nav.css` is the reference theme (metadata header, restyle
  only, `::before` instead of DOM edits). User themes go in `<userData>/themes/`; a user theme
  with the same id overrides a shipped one. `docs/CUSTOM_THEMES.md` is referenced from
  `tokens.css` but not written yet.
