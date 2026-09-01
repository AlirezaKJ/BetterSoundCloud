# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: people who already installed BetterSoundCloud and left.** v0.7.x shipped two
failures that made it unusable — tracks that grey out and auto-skip, and "we detected unusual
activity" blocks on sign-in, liking and following. Ten of the eighteen most-commented open
issues are one of those two. The job is simply *"let me listen to SoundCloud on my desktop
without the app fighting me."*

Their situation, from the tracker rather than assumption:

- **Windows-primary.** Every reporter who named an install on the auto-skip cluster was on the
  Windows MSI. Linux appears mainly in launch failures (#96, #99, #109, #55); macOS is barely
  represented, which means it is under-exercised rather than unaffected.
- **Installed once, then forgotten.** The maintainer's standard reply across #89, #91, #93, #74
  and #75 is "try the new release" — and users have no in-app signal that one exists.
- **Not technical, mostly.** Reports are behavioural ("some songs just skip", "it says I'm
  blocked"), not diagnostic. The app has to tell them what went wrong; they cannot inspect it.

**Secondary, confirmed by behaviour:** a handful of contributors who do unpaid diagnostic work.
One (`Jeter361`) reverse-engineered a login workaround and posted patched `main.js` and
`preload.js` files on #97. This audience is small, real, and already engaged.

## Product Purpose

A desktop client that wraps SoundCloud's own web app and adds what a browser tab cannot:
Discord Rich Presence, Last.fm scrobbling, media-key control, themes, plugins, synced lyrics,
and track downloads.

It exists because SoundCloud ships no desktop client, and because part of its catalogue now
requires Widevine DRM that ordinary Electron cannot play.

**Success** is the tracker going quiet: the blocked-playback and blocked-login clusters closed
with their original reporters confirming, and lapsed users installing again.

## Positioning

**The most complete desktop SoundCloud client** — the union of every capability across
BetterSoundCloud v0.7.x and other soundcloud modified extensions/apps.

Neither predecessor is complete on its own. v0.7.x has synced lyrics, a downloader, an in-app
CSS/JS editor and hand-tuned themes; other extensions/apps have hot-reloading plugin and theme folders,
i18n, proxy support, webhooks, Windows thumbar controls, an auto-updater and encrypted
credentials. v2's stated goal is to carry all of it.

## Operating Context

- **The product is a shell around someone else's app.** SoundCloud's web app renders all music
  UI inside a content view. BetterSoundCloud owns a 32px chrome strip, a settings panel, and
  overlays. Anything SoundCloud changes is outside our control and can break us.
- **Part of the catalogue is DRM-protected.** SoundCloud serves Widevine-CENC HLS for some
  tracks. Playing them requires the Castlabs Electron build *and* a VMP signature applied to the
  packaged app. This is verified, not theoretical.
- **SoundCloud runs bot and abuse detection.** Its sign-in path loads DataDome and computes a
  client signature. A desktop client that emits automation signals gets its users challenged or
  blocked — during sign-in, and when liking or following.
- **Distribution is GitHub Releases.** Windows NSIS + portable, macOS DMG, Linux AppImage/deb/rpm.
  Users find the app through the repo and its site.
- **Updates are part of the fix, not polish.** Because fixes are delivered by release and users
  have no in-app update signal, a working updater is load-bearing for the primary user's job.

## Capabilities and Constraints

**Working in v2 today** (verified, `rewrite` branch):

- Castlabs Electron with Widevine; VMP signing wired and **proven** — the auto-skip bug
  (#89/#91/#95/#105) is fixed against a signed build
- Frameless window: a 32px chrome view stacked over a SoundCloud content view
- Settings panel generated entirely from one schema, with an animated overlay presentation
- Single-source user agent derived from the running Chromium; startup fails if it leaks app identity
- Off-site links and OAuth routed to the system browser; permission allowlist including `mediaKeySystem`
- Appearance (System/Light/Dark), zoom, hardware acceleration

**Not yet built:** tray, Discord RPC, Last.fm, themes, plugins, lyrics, downloader, i18n,
proxy, webhooks, auto-updater. Nine of twelve settings are marked unwired in the schema and
render disabled rather than lying. Full backlog: [TODO.md](TODO.md).

**Durable constraints:**

- **Never mutate SoundCloud's DOM.** No `innerHTML` on existing nodes, no insertion into React
  containers, no `.remove()`. Cosmetic changes are CSS-only via `insertCSS`.
- **No polling on the SoundCloud origin, and no synthetic clicks.** Enforced by ESLint.
- **One user agent, set once, at the lowest layer.** No header rewriting, no JS property
  spoofing, no client-hint tampering.
- **Castlabs Electron and VMP signing are mandatory** for any release that must play DRM tracks.
- MIT licensed; app identifier `com.alirezakj.bettersoundcloud`.

**Explicitly declined** (recorded so they are not re-proposed): region/geo bypass (#19, #26);
AI or ML features of any kind; `sendInputEvent` to forge trusted input; `sec-ch-ua` spoofing;
the `cookies.json` session-import workaround.

**Open decisions** (undecided, not to be invented): Windows code-signing and macOS notarization
funding; Discord client ID reuse vs. new; whether to ship a default Last.fm API key; telemetry
(currently none); whether v0.7.x settings are migrated or reset.

## Brand Commitments

- **Name stays BetterSoundCloud.** Changing it would break update continuity and macOS keychain
  grants after release.
- **Author:** AlirezaKJ. **Licence:** MIT. **Repo:** `AlirezaKJ/BetterSoundCloud`.
- **Icon:** `build-resources/icon.png`, 1000×1000, the single source for all platform icons.
- **Voice, as practised in the codebase and issue threads:** plain, specific, and honest about
  what does not work. The settings panel labels unbuilt features "Not implemented yet" rather
  than shipping controls that silently do nothing. This is a deliberate posture, not an accident.
- **Incumbent, not yet declared binding:** SoundCloud orange (`#f50`) as the accent, on neutral
  greys. Recorded as the existing state so later visual work knows what it inherits.

## Evidence on Hand

**Real, and usable:**

- **42 open GitHub issues** with first-hand user reports, screenshots and reproduction details.
  The two headline clusters are documented with named reporters willing to re-test.
- **A verified fix.** VMP signing demonstrably resolves the auto-skip bug — EVS reported
  `Existing signature invalid` on first sign, then `Signature is valid: streaming, 1417 days
  left`, and a track that greys out on v0.7.1 plays on the signed build (2026-09-01).
- **Planning record** in the maintainer's Obsidian vault: the v2 roadmap, a feature-gap analysis
  against soundcloud-rpc, and the tech-stack decision record.
- **[TODO.md](TODO.md)** — 120 items across 13 milestones, each traced to a file, issue or phase.
- **Two reference implementations:** v0.7.x at git `fb3bfdd`, and `richardhbtz/soundcloud-rpc`.

**Absent — must not be fabricated:** no install or user counts, no testimonials, no reviews, no
press, no benchmarks, no revenue or pricing. There is no marketing site copy under version
control. Any future surface needing social proof has none to draw on and must not invent it.

## Product Principles

1. **Parity, not evasion.** Make a legitimate desktop client indistinguishable from the ordinary
   browser it wraps, for real logged-in users. Never build rate-limit evasion, captcha solving or
   region bypass. This is what rejects both spoofed client hints and forged input events.
2. **Never touch SoundCloud's page.** Our chrome lives outside the document. This is what makes
   the app survive SoundCloud's changes instead of breaking on every release.
3. **Say what does not work.** Disabled controls with honest labels beat controls that silently
   do nothing. The users being won back left because the app failed quietly.
4. **Readable over clever.** Open source with drive-by contributors; the reader's cost is a
   first-class constraint alongside correctness.
5. **Breadth, earned in order.** The goal is the complete client, but playback and sign-in come
   before features — a broader app that still cannot log in wins nobody back.

## Accessibility & Inclusion

**Target: WCAG 2.2 AA** for BetterSoundCloud's own interface — the chrome strip, settings panel,
and any overlays.

In practice: contrast ratios met in both light and dark, visible focus states on every
interactive element, full keyboard operability, correct roles and labels, and honoured
`prefers-reduced-motion` and `prefers-color-scheme`.

**Scope boundary:** SoundCloud's own page is outside our control and cannot be held to this
standard. The commitment covers what we render.
