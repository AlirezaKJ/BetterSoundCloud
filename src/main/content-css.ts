/**
 * The stylesheet we ask SoundCloud's page to wear, built as one pure string.
 *
 * Pure and separate from `window.ts` because it is the one piece of v2 that reaches into
 * somebody else's layout, and getting it wrong is not a crash — it is a page that looks
 * subtly broken. A pure function can be unit-tested against the numbers below; a string
 * built inline next to `insertCSS` cannot.
 *
 * Nothing here adds a node to their document. `insertCSS` adds a stylesheet, and that is
 * the whole extent of the contact.
 */

/**
 * Two widths, both measured, at which SoundCloud's header needs help to hold our buttons.
 *
 * The metric is NOT whether the header wraps — that was the mistake in the first attempt at
 * this. A header can sit happily on one line and still overflow the window underneath our
 * overlay, because below ~960px SoundCloud stops shrinking its container and lets the page
 * scroll sideways instead. What matters is whether their rightmost control stays clear of the
 * 144px strip we occupy.
 *
 * Measured on the live logged-in page, right edge of their content vs `width - 144`:
 *
 * ```
 *                                960    900    850    800
 * upsells hidden               clear  over60 over110 over160     <- container stuck at 960
 * force-fit only                wrap   wrap    wrap    wrap
 * force-fit + upsells          clear  clear    wrap    wrap
 * force-fit + upsells + studio clear  clear   clear   clear
 * ```
 *
 * Hence two tiers. Below `COMPACT_HEADER_WIDTH` the paid-tier upsells go, which is enough while
 * their container still shrinks. Below `FIT_HEADER_WIDTH` the container has hit its own floor,
 * so it is forced down to the viewport and Artist Studio goes too. Upload, search, the nav links
 * and every account control stay at all widths.
 *
 * COMPACT is 1100 rather than the 1080 the table suggests, as insurance rather than as a measured
 * requirement. Their right-hand group is right-aligned to the padded content box, so its edge sits
 * at the reservation boundary whenever it fits at all — which means the clearance check is a
 * pass/fail on overflow, not a measure of spare room, and it cannot see how close a width is to
 * tipping over. Their content is not fixed width either: a longer username, a two-digit
 * notification badge, a localised label or a fallback font mid-load all widen `.header__right` and
 * move the width at which overflow begins. Hiding the upsells between 1080 and 1100 takes 167px out
 * of that group, which puts real distance between the boundary and any such growth. The cost is two
 * advertisements disappearing 20px earlier than strictly necessary; the cost of being 20px late is a
 * live control sitting under a transparent view, which the project treats as unacceptable.
 */
export const COMPACT_HEADER_WIDTH = 1100
export const FIT_HEADER_WIDTH = 1000

/**
 * The floor for showing the overlay at all, in CSS pixels.
 *
 * Equal to the window's own `minWidth`, so under normal use the overlay always shows. It is
 * still reachable by zooming in — the page's CSS width is the window's divided by the zoom
 * factor, so an 800px window at 150% is 533 CSS px — and below the measured range the header
 * wraps whatever we do. There, `layout()` falls back to our own bar rather than guessing.
 */
export const MIN_EMBED_WIDTH = 800

export interface ContentCssOptions {
  /**
   * SoundCloud's own colours for the mode the theme was made for (its `@mode`), or empty. Goes
   * right BEFORE the theme, so the theme still wins: it is the floor the theme was written on, not
   * part of the theme. It only applies while SoundCloud shows the other mode — see
   * resources/soundcloud-palette-dark.css.
   */
  palette?: string
  /**
   * The selected theme's CSS for SoundCloud's page, or empty for none. Placed after the rules a
   * theme may restyle (the scrollbar) and BEFORE the rules it must not break: the space reserved
   * for our overlays, and the user's own layout settings. A theme that set `.header__inner`'s
   * padding used to win here and slide SoundCloud's controls under our transparent buttons —
   * visible, but dead to clicks.
   */
  theme?: string
  /**
   * The Minimal navigation CSS when that switch is on, else empty. Right after the theme, so it
   * applies on top of any of them, and before the layout rules for the same reason as a theme.
   */
  minimalNavigation?: string
  /**
   * The background layer (`backgroundCss`) when the Background setting is on, else empty. After
   * the theme and Minimal navigation, because it has to win over a theme's own page colours and
   * over a theme's own `body::before` (Glassmorphism draws its backdrop there); before the layout
   * rules for the same reason as a theme.
   */
  background?: string
  /**
   * The Glass layer's page rules (`glassCss`) while the window has glass under it, else empty.
   * After the theme and Minimal navigation, because it must clear a theme's solid page colours;
   * before the Background, so a picture can still be laid over the glass.
   */
  glass?: string
  /**
   * CSS pixels to reserve at the right-hand end of the play controls for our own buttons,
   * or null when they are switched off.
   */
  playerReserve?: number | null
  /** Override SoundCloud's centred container so the bars span the window. */
  fullWidth: boolean
  /**
   * "Hide the top bar until you point at it" is on: SoundCloud's header gets the transition it
   * slides with. Hiding it is `headerHiddenCss`, a sheet of its own swapped on every reveal.
   */
  autoHideHeader?: boolean
  /**
   * Hide SoundCloud's paid-tier upsells to free the width our buttons need. Only meaningful
   * alongside `reserve`, and only set below `COMPACT_HEADER_WIDTH`.
   */
  compactHeader?: boolean
  /**
   * Force their header down to the viewport and hide Artist Studio as well. Only below
   * `FIT_HEADER_WIDTH`, where their container has stopped shrinking on its own.
   */
  fitHeader?: boolean
  /**
   * CSS pixels to reserve at the right end of the header for our window buttons,
   * or null when the embedded buttons are not showing.
   */
  nativeControlsReserve?: number
  reserve: number | null
}

export function buildContentCss({
  fullWidth,
  reserve,
  palette,
  theme,
  minimalNavigation,
  background,
  glass,
  autoHideHeader,
  playerReserve,
  compactHeader,
  fitHeader,
  nativeControlsReserve
}: ContentCssOptions): string {
  // Always applied. Chrome's default scrollbar is 15px of opaque grey, and because
  // SoundCloud's header is sized to `clientWidth` it stops short by exactly that much —
  // which is what our window buttons were colliding with. A thin transparent track stops
  // it reading as a slab down the side of the page.
  //
  // Neutral at rest, accent on hover: that keeps the accent marking a *state* rather than
  // decorating, per the Borrowed Accent Rule in docs/DESIGN.md. The thumb is mid-grey
  // alpha rather than a token value because SoundCloud has its own light and dark themes
  // and we cannot know which one is showing.
  const rules: string[] = [
    `::-webkit-scrollbar { width: 2px; height: 2px; }
     ::-webkit-scrollbar-track { background: transparent; }
     ::-webkit-scrollbar-corner { background: transparent; }
     ::-webkit-scrollbar-thumb { background: rgb(128 128 128 / 40%); border-radius: 4px; }
     ::-webkit-scrollbar-thumb:hover,
     ::-webkit-scrollbar-thumb:active { background: #f50; }`,
    // Themes may use `--bsc-cover` (the playing track's artwork). Its real value lives in a
    // separate, more specific sheet that changes once per track; this is the default for
    // when nothing is playing. See `coverCss` in src/shared/themes.ts.
    ':root { --bsc-cover: none; }'
  ]

  // A theme restyles everything above; everything below keeps SoundCloud's controls clickable
  // and the user's own settings in force, so it comes after the theme and wins.
  if (palette) rules.push(palette)
  if (theme) rules.push(theme)
  if (minimalNavigation) rules.push(minimalNavigation)
  if (glass) rules.push(glass)
  if (background) rules.push(background)
  if (autoHideHeader) {
    rules.push(
      'html body #app > header.header { transition: transform 180ms ease, opacity 180ms ease !important; }'
    )
  }

  if (fullWidth) {
    // `min-width`, never `width`. SoundCloud's `.l-container` is 1240px and steps down to
    // 1080 and 960 as the window narrows; `width: 100%` overrode those steps in BOTH
    // directions, so below ~900px it squeezed the header narrower than SoundCloud ever
    // builds it and the contents wrapped out of the bar onto the page. `min-width` can
    // only ever widen: above 1240 we get the full-width bars the setting is for, and below
    // it SoundCloud's own responsive steps are left completely alone.
    rules.push(
      '.header__inner, .playControls__wrapper' +
        ' { min-width: 100% !important; max-width: none !important; }'
    )
  }

  if (reserve !== null) {
    // No media query. `reserve` is non-null only when the overlay is actually on screen, so
    // the gap and the buttons appear and disappear together by construction — there is no
    // width at which one applies without the other. A query here meant two thresholds that
    // disagreed by the width of the scrollbar.
    //
    // On the drag region: with our own bar hidden, SoundCloud's header IS the titlebar, so it
    // behaves like one. Every descendant is explicitly `no-drag`, so only the bare background
    // between their controls becomes a grab handle — links, the search field and their buttons
    // all keep working. The `*` is what makes that safe; there is no element it can miss. If
    // `.header` is ever renamed the window simply stops being draggable there, which is why
    // the overlay keeps its own small handle around the buttons.
    rules.push(
      `.header__inner { padding-right: ${reserve}px !important; }
       .header { -webkit-app-region: drag; }
       .header * { -webkit-app-region: no-drag; }`
    )
  }

  if (reserve !== null && nativeControlsReserve) {
    rules.push(`.header__inner { padding-left: ${nativeControlsReserve}px !important; }`)
  }

  if (reserve !== null && compactHeader) {
    // The paid-tier promos are 167px of the header and pure advertising. They go first
    // because they cost the user nothing: both destinations stay in the account menu.
    rules.push(
      `.header__right .header__fanUpsell,
       .header__right .creatorSubscriptionsButton,
       .header__upsellWrapper { display: none !important; }`
    )
  }

  if (reserve !== null && fitHeader) {
    // Below ~960 their container stops shrinking and overflows the window instead, so their
    // controls slide under our overlay while the header still looks perfectly fine on one
    // line. `min-width: 0` overrides both their floor and our own full-width rule above,
    // which is why this has to come after it.
    //
    // Artist Studio joins the upsells here — measured, the two together are not enough at 850
    // and below, and this is the smallest thing left that is a destination rather than a
    // control. Upload stays.
    rules.push(
      `.header__inner {
         min-width: 0 !important;
         width: 100% !important;
         max-width: 100% !important;
       }
       .header__right .header__forArtistsButton { display: none !important; }`
    )
  }

  if (playerReserve) {
    // Their bar already carries 16px here; ours replaces it, so the number is the whole
    // distance from the right edge rather than an addition to it. No media query, unlike the
    // header reservation: `.playControls__elements` is a flex row whose timeline absorbs the
    // loss, where the header was `nowrap` and wrapped its contents onto the page instead.
    rules.push(`.playControls__wrapper { padding-right: ${playerReserve}px !important; }`)
  }

  return rules.join('\n')
}

/*
 * ── The background ────────────────────────────────────────────────────────────────────────
 *
 * v0.7.x's custombg plugin prepended a full-window <div> into SoundCloud's #app, rewrote the
 * inline styles of their content column, and swapped the picture on a 100ms timer. v2 does it
 * with one stylesheet: a pseudo-element of their <body>, which adds no node to their document,
 * fed by a custom property that changes once per track (`--bsc-cover`) or once per chosen
 * picture (`--bsc-picture`).
 */

export interface BackgroundOptions {
  /** What to show: the playing track's artwork, or the picture the user chose. */
  source: 'artwork' | 'picture'
  /** Blur in CSS pixels, 0 for none. */
  blur: number
  /** How much of the picture shows, in percent: 100 is full colour, lower fades it out. */
  strength: number
}

/**
 * The layer behind SoundCloud's page.
 *
 * How it stacks, which is the whole trick: `isolation: isolate` makes <body> a stacking context
 * without positioning it, so `body::before` at `z-index: -1` paints ABOVE body's own background
 * and BELOW everything inside it. The picture is then faded with `opacity`, which blends it into
 * whatever colour the page itself is — SoundCloud's light or dark, or the theme's — so the page
 * keeps its palette and its text stays readable. With nothing playing, `--bsc-cover` is `none`,
 * the layer is empty, and the page looks exactly as it does without a background.
 *
 * `#app` and the content column are made see-through, because most themes paint them solid and
 * the background would otherwise not show anywhere (measured 2026-10-27: Dark Cloud, Hover,
 * Nocturnal and PostMorphic all hid it completely). The header, the player and a theme's own
 * panels keep their colours.
 *
 * The layer reaches twice the blur past every edge: a blur fades the picture out toward its
 * edges, and that fade must happen off screen. A fixed box adds nothing to the page's scrolling,
 * however far it reaches (measured: no change in either direction).
 *
 * Selectors start `html body` and every value is `!important`, so this wins over a theme's
 * `body` and `body::before` rules wherever the two are inserted.
 */
export function backgroundCss({ source, blur, strength }: BackgroundOptions): string {
  const px = Math.min(Math.max(Math.round(blur), 0), 40)
  const opacity = Math.min(Math.max(Math.round(strength), 0), 100) / 100
  const image = source === 'picture' ? 'var(--bsc-picture, none)' : 'var(--bsc-cover, none)'
  return `html body { isolation: isolate !important; }
html body #app,
html body #app > .l-container,
html body #app .l-container.l-content { background: transparent !important; }
html body::before {
  content: '' !important;
  position: fixed !important;
  inset: ${-2 * px}px !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background: ${image} center / cover no-repeat !important;
  filter: ${px > 0 ? `blur(${px}px)` : 'none'} !important;
  opacity: ${opacity} !important;
  transform: none !important;
}`
}

/*
 * ── Glass ─────────────────────────────────────────────────────────────────────────────────
 *
 * With Glass on, a live blur of what is behind the window is drawn UNDER SoundCloud's view
 * (native/window-glass), and the view itself is see-through. All this sheet has to do is stop the
 * page painting over it — and do so whatever theme is selected, so it can be combined with any.
 */

/**
 * SoundCloud's page on glass.
 *
 * One continuous pane, not a stack of boxes: the page, its columns and its strips are cleared
 * rather than given fills of their own. Only two kinds of surface keep any colour, and each for a
 * reason.
 *
 * **Chromium blurs nothing over glass** (measured 2026-11-10, a probe outside the repo): a
 * `backdrop-filter` only blurs a backdrop that is opaque, and on glass the page and its view are
 * both see-through. White text under a 40px blur over a transparent page stayed exactly as sharp
 * as with no blur at all; over an opaque one it vanished. Not a compositor switch (Direct
 * Composition, delegated compositing, GPU compositing off: no change), not the backdrop root
 * (`opacity`, `will-change`, `isolation`, `contain` wrappers: no change), and not where the filter
 * sits. What matters is how opaque the backdrop is — the blur grows with it, and from 80% up it is
 * complete to the eye (edge contrast 21.2 at 0%, 5.3 at 50%, 1.1 at 80%, 0.3 at 99%; the user's
 * call by eye, 80% and above "looked good").
 *
 * - **The header and the play bar** are a darker glass: a plain 45% near-black fill (`GLASS_BAR`),
 *   the same as our own bar above them. The page is cut off under them (`GLASS_CLIP`), so no blur
 *   is needed: nothing scrolls behind them to hide. Two builds gave them glass of their own
 *   (a fixed 80% underlay below the page for the blur to work on, then a dark tint over the blur)
 *   and the user preferred no glass there at all (by eye, 2026-11-10: "not a fan of how the blur
 *   looks"). Solid, a track scrolling under a bar is simply hidden, as on SoundCloud itself.
 *   Never leave see-through pixels beside a fixed bar while the page scrolls under it: a blur
 *   (one build) and floating pills with a shadow (another) both left the page smeared with stale
 *   frames on scroll — Chromium does not repaint content passing under such pixels on a fully
 *   transparent page (seen twice by the user, 2026-11-10).
 * - **What floats over SoundCloud's own content** (the queue, menus, the search suggestions,
 *   dialogs) cannot have an underlay — it can be anywhere — so it is simply nearly solid, or the
 *   text underneath would read through it.
 *
 * The surfaces were measured, not guessed (2026-11-10): every element painting an opaque
 * background over 0.4% of the window or more, on Discover, a track, a profile and a playlist page,
 * signed out, at 1366×800. Body, `.l-container`, the header, the queue, the sign-in banner and the
 * search field were the opaque ones; artwork is a background IMAGE and is never touched
 * (`background-color` only, below, wherever a picture could be involved).
 *
 * Selectors start `html body` (or `html:root`) and every value is `!important`, so this beats a
 * theme's own page colours (Dark Cloud paints `#app > .l-container` solid with `!important`)
 * wherever the sheets land. Themes' smaller panels keep their colours: Glass changes the ground,
 * not the theme. The bars' heights are SoundCloud's own: 46 CSS px for the header (§4, pinned for
 * themes too) and `--play-controls-height` for the play bar.
 */
/**
 * The header's, the play bar's and our own bar's fill on glass: the same glass, darker, so the three
 * match each other and the page (the user's call by eye, 2026-11-10: solid bars "stand out too
 * much"). A plain fill and nothing else — no blur, no shadow, no gap — because those smeared (see
 * the glass notes above). Nothing of SoundCloud's shows through it: `GLASS_CLIP` cuts the page
 * off where the bars begin.
 */
const GLASS_BAR = 'rgb(14 14 14 / 45%)'
/** SoundCloud's header height in its own CSS pixels (§4; themes are held to it too). */
const SC_HEADER_HEIGHT_CSS = '46px'

/*
 * SoundCloud's grey surfaces, made glass. SoundCloud paints nearly every panel, tile and card
 * from a few colour variables (measured from its palette, resources/soundcloud-palette-dark.css):
 * `--highlight-color` and `--background-highlight-color` (#303030: the download panel, cards,
 * tiles), the secondary-button, input and tag backgrounds (#303030), and
 * `--background-surface-color` (#121212). Redefining those on glass catches them wherever
 * SoundCloud uses them, without naming a single class. `--surface-color` is NOT touched: the play
 * buttons draw their triangle in it (CLAUDE.md §17). Declared on `html body` with `!important`
 * because SoundCloud declares them on `body.theme-dark`, which is more specific.
 */
/** A barely-there pane for SoundCloud's panels: separation without a box. */
const GLASS_VEIL = 'rgb(255 255 255 / 5%)'
/** Controls (buttons, fields, tags): one step lighter, so they still read as things to press. */
const GLASS_PANE = 'rgb(255 255 255 / 9%)'

/** The page itself cleared: nothing between SoundCloud's content and the glass. */
const GLASS_CLEAR = `html, html body,
html body #app,
html body #app > .l-container,
html body #app .l-container.l-content,
html body #content { background-color: transparent !important; background-image: none !important; }`

/**
 * SoundCloud's surfaces as glass: its colour variables, its banner, the track hero's gradient, its
 * hairlines, its fields and what floats over the page. Shared by the page and its `/n/` frame.
 *
 * The `/n/` frame is a different app: Material UI (measured 2026-11-10, the signed-in track page).
 * It paints from MUI's own variables — `--mui-palette-highlight-main` (#303030, the download card),
 * `--mui-palette-grey-900` and `AppBar-defaultBg` (#212121, the uploader card and the stat tiles),
 * `--mui-palette-background-default` (#121212) — so those are redefined the same way. Its classes
 * are hashed per build (`mui-1inzlnd`), so the only selectors used are MUI's stable ones
 * (`.MuiCard-root`) and an accessible name (`section[aria-label="Track header"]`, the hero, whose
 * artwork-coloured backing is cleared like the classic hero's). The track sidebar's cards and stat tiles (#212121, hard-coded
 * in hashed classes) are found through `aside[aria-label="Track sidebar"]` and simply cleared: no
 * boxes, the text sits on the glass. `--mui-palette-background-paper` is left alone: menus and
 * dialogs use it, and they float over the page.
 */
const GLASS_SURFACES = `html body {
  --background-surface-color: transparent !important;
  --highlight-color: ${GLASS_VEIL} !important;
  --background-highlight-color: ${GLASS_VEIL} !important;
  --button-secondary-background-color: ${GLASS_PANE} !important;
  --button-secondary-active-background-color: ${GLASS_PANE} !important;
  --button-secondary-selected-background-color: ${GLASS_PANE} !important;
  --button-secondary-selected-active-background-color: ${GLASS_PANE} !important;
  --button-secondary-disabled-background-color: ${GLASS_PANE} !important;
  --button-secondary-loading-background-color: ${GLASS_PANE} !important;
  --button-tertiary-background-color: transparent !important;
  --button-tertiary-active-background-color: transparent !important;
  --button-tertiary-selected-background-color: transparent !important;
  --button-tertiary-selected-active-background-color: transparent !important;
  --input-default-background-color: ${GLASS_PANE} !important;
  --input-focused-background-color: ${GLASS_PANE} !important;
  --input-invalid-background-color: ${GLASS_PANE} !important;
  --input-placeholder-background-color: ${GLASS_PANE} !important;
  --tag-default-background-color: ${GLASS_PANE} !important;
}
/* SoundCloud's /n/ iframe is color-scheme dark and the page around it normal. Chromium paints an
   iframe whose scheme differs from its element's an OPAQUE canvas, so the frame's cleared page
   showed as flat grey (measured 2026-11-10: every background in both documents transparent, the
   frame still grey). Same scheme on the element, and the frame stays see-through. */
html body iframe[src^="https://soundcloud.com/n/"] { color-scheme: dark !important; }
html body .banner {
  background-color: ${GLASS_VEIL} !important;
  border: 0 !important;
  border-radius: 16px !important;
}
/* The hero's backing (an artwork-coloured gradient): gone, so the play button, title, waveform and
   artwork sit straight on the glass (the user's call by eye, 2026-11-10: "better without it"). */
html body .backgroundGradient { opacity: 0 !important; }
html body .sc-border-light,
html body .sc-border-light-top,
html body .sc-border-light-bottom,
html body .sc-border-light-left,
html body .sc-border-light-right { border-color: rgb(255 255 255 / 6%) !important; }
html body .headerSearch__input,
html body .sc-input { background-color: rgb(255 255 255 / 8%) !important; }
html body .queue,
html body .queue__scrollableInner,
html body .dropdownMenu,
html body .dropbar__content,
html body .moreActions,
html body .headerSearch__suggestions,
html body .modal__modal,
html body .g-modal-section { background-color: rgb(20 20 20 / 94%) !important; }
html body .queue__itemWrapper,
html body .queueItemView { background-color: transparent !important; }
html body {
  --mui-palette-background-default: transparent !important;
  --mui-palette-highlight-main: ${GLASS_VEIL} !important;
  --mui-palette-grey-900: ${GLASS_VEIL} !important;
  --mui-palette-AppBar-defaultBg: ${GLASS_VEIL} !important;
}
html body section[aria-label="Track header"] {
  background-color: transparent !important;
  background-image: none !important;
}
html body .MuiCard-root { background-color: ${GLASS_VEIL} !important; }
/* Artist tools on Discover (an /n/embeds frame): its stat tiles, #212121 in a hashed class. */
html body a.MuiBox-root[data-reveal] { background-color: ${GLASS_VEIL} !important; }
html body [class*="g-type-shrinkwrap"] { background-color: transparent !important; }
/* Behind a track's hover actions (like, more): a gradient of SoundCloud's page colour, which on
   glass is a black smear. */
html body .soundBadge__additional { background-image: none !important; }
/* Waveforms as frosted glass, not grey (the user's call, 2026-11-10: "make it glassy"). On the
   /n/ pages MUI draws one as SVG groups filled from three palette variables (measured): unplayed
   (--mui-palette-contrast-light, white 60%: the grey), played (contrastText, white) and the
   reflection (contrast-dark, white 16%); a CSS fill beats their fill attributes. The classic
   pages draw it on a canvas, which only a filter can recolour: greyscale, lifted, see-through. */
html body [role="slider"][aria-label="Waveform"] svg g[clip-path*="unplayed"] { fill: rgb(255 255 255 / 30%) !important; }
html body [role="slider"][aria-label="Waveform"] svg g[clip-path*="-played"] { fill: rgb(255 255 255 / 92%) !important; }
html body [role="slider"][aria-label="Waveform"] svg g:not([clip-path])[fill] { fill: rgb(255 255 255 / 10%) !important; }
html body .waveform canvas { filter: grayscale(1) brightness(1.5) !important; opacity: 0.8 !important; }
html body aside[aria-label="Track sidebar"] .MuiStack-root { background-color: transparent !important; }`

/**
 * SoundCloud's content cut off where its header and play bar begin, so nothing of the page is ever
 * drawn under a bar — they can be glass like the page without text showing through them. Chromium
 * cannot blur over glass (above), so this, not a blur, is what keeps the bars readable.
 *
 * The window still scrolls as before: SoundCloud loads more of a feed when the WINDOW scrolls, and
 * making `body` the scroller instead stopped it dead (measured 2026-11-10: 13 posts before and after
 * six scrolls to the bottom; with this mask, 13 then 67). So the content column wears a mask, and
 * a scroll-driven animation keeps the mask fixed to the screen. Its `view()` timeline runs from the
 * column's top entering at the bottom of the screen (progress 0, the column `100vh` below the top)
 * to its bottom leaving at the top (progress 1, the column its own height above it), so the
 * screen's top sits at `p·(100vh + H) − 100vh` inside the column — which `mask-position` can say
 * exactly: with a `100vh` tall mask, a percentage there is of `H − 100vh`, so `0 −100vh` to
 * `0 calc(100% + 100vh)` is that line. Pure CSS, no script, no node. The column is a sibling of the
 * bars (`#app > .l-container.l-content`), so the bars themselves are never masked; SoundCloud's
 * `/n/` iframe sits outside it and already ends at the play bar.
 */
const GLASS_CLIP = `@keyframes bsc-glass-clip {
  from { mask-position: 0 -100vh; }
  to { mask-position: 0 calc(100% + 100vh); }
}
html body #app > .l-container.l-content {
  mask-image: linear-gradient(to bottom, transparent ${SC_HEADER_HEIGHT_CSS}, #000 ${SC_HEADER_HEIGHT_CSS});
  mask-size: 100% 100vh;
  mask-repeat: no-repeat;
  animation: bsc-glass-clip linear both;
  animation-timeline: view();
}
html:has(.playControls.m-visible) body #app > .l-container.l-content {
  mask-image: linear-gradient(
    to bottom,
    transparent ${SC_HEADER_HEIGHT_CSS},
    #000 ${SC_HEADER_HEIGHT_CSS},
    #000 calc(100% - var(--play-controls-height, 48px)),
    transparent calc(100% - var(--play-controls-height, 48px))
  );
}`

export function glassCss(): string {
  return `${GLASS_CLEAR}
${GLASS_SURFACES}
${GLASS_CLIP}
html body #app > header.header,
html body .header__inner,
html body .playControls__bg,
html body .playControls__inner { background-color: ${GLASS_BAR} !important; }
html body #app > header.header { border-bottom: 0.5px solid rgb(255 255 255 / 8%) !important; }
html body .playControls__inner { border-top: 0.5px solid rgb(255 255 255 / 8%) !important; }

/* The bar's controls as bare icons. SoundCloud draws them as #303030 boxes on a #303030 bar, so
   they never show; on our near-black bar every one was a grey box, and Next up, 24px wide, a box
   cut in half (2026-11-10). The play button keeps its white circle; liked and followed still show
   by their orange icon. */
html body .playControls__inner .sc-button:not(.sc-button-play) {
  background-color: transparent !important;
  border-color: transparent !important;
  border-radius: 8px !important;
}
html body .playControls__inner .sc-button:not(.sc-button-play):hover {
  background-color: rgb(255 255 255 / 8%) !important;
}`
}

/**
 * The same glass for SoundCloud's newer pages, which it draws inside a same-origin iframe of the
 * page (`https://soundcloud.com/n/…`, `iframe.webiIframe`; the signed-in track page, measured
 * 2026-11-10). The frame is cleared and its surfaces made glass like the page's, but it gets no bar
 * underlays: it has no header or play bar of its own, and an `html::before` there would lay a dark
 * strip across its top. It reaches the frame through the content preload (`frameCss`).
 */
export function glassFrameCss(): string {
  return `${GLASS_CLEAR}
${GLASS_SURFACES}`
}

/**
 * What SoundCloud's `/n/` frame wears: the same scrollbar, palette, theme and glass as the page
 * around it, and none of the page's layout rules (they are about the header and the play bar,
 * which live in the page, not the frame). Without this, no theme, and no glass, reached those
 * pages at all: `webContents.insertCSS` styles the top frame only.
 */
export function buildFrameCss({
  palette,
  theme,
  glass
}: Pick<ContentCssOptions, 'palette' | 'theme' | 'glass'>): string {
  return [
    `::-webkit-scrollbar { width: 2px; height: 2px; }
     ::-webkit-scrollbar-track { background: transparent; }
     ::-webkit-scrollbar-corner { background: transparent; }
     ::-webkit-scrollbar-thumb { background: rgb(128 128 128 / 40%); border-radius: 4px; }`,
    ':root { --bsc-cover: none; }',
    palette,
    theme,
    glass
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * SoundCloud's header slid up out of sight, for "Hide the top bar until you point at it". Its own
 * small sheet, inserted while the header is hidden and removed when it is revealed, like the
 * cover's, so a reveal swaps a few lines instead of the whole page sheet. The header keeps its box
 * (46 CSS px, §4); only a transform moves it, so nothing in the page reflows. With Glass on, the
 * page is no longer cut off at the top (`GLASS_CLIP`), so it runs up to the window's edge.
 *
 * **Except while the keyboard is in it** (`:focus-visible` inside the header): main only watches
 * the pointer, so typing in SoundCloud's search box and moving the pointer down to the results
 * slid the box away mid-word, and Tab walked through links nobody could see. `:focus-visible`,
 * not `:focus-within`, so a link clicked with the mouse, which keeps focus after SoundCloud moves
 * to its page, does not pin the header on screen. Pure CSS: the page tells us nothing.
 */
export function headerHiddenCss(glass: boolean): string {
  const rules = [
    'html body #app > header.header:not(:has(:focus-visible)) { transform: translateY(-100%) !important; opacity: 0 !important; pointer-events: none !important; }'
  ]
  if (glass) {
    // While the keyboard brings the header back, the page is cut off under it again.
    const away = 'html:not(:has(#app > header.header :focus-visible))'
    rules.push(
      `${away} body #app > .l-container.l-content { mask-image: none !important; }`,
      `${away}:has(.playControls.m-visible) body #app > .l-container.l-content { mask-image: linear-gradient(to bottom, #000 calc(100% - var(--play-controls-height, 48px)), transparent calc(100% - var(--play-controls-height, 48px))) !important; }`
    )
  }
  return rules.join('\n')
}

/**
 * Our 32px bar on glass: its page cleared and its strip given the solid colour of SoundCloud's
 * header beside it (`glassCss`), so the two read as one bar. Goes after the theme's own sheet for
 * the header (it is appended to it), so it wins over a theme's `--bsc-header-bg`.
 *
 * **Glass is dark, so the bar's ink is too.** The bar follows the app's Appearance, and with it
 * on Light the title and buttons were dark grey on the near-black glass, all but invisible
 * (2026-11-11). Under a light scheme the inks become tokens.css's dark ones (`GLASS_BAR_INKS`,
 * held equal to that file by a test). Not under forced colours, where the system's own win.
 */
export function glassHeaderCss(): string {
  const inks = Object.entries(GLASS_BAR_INKS)
    .map(([token, value]) => `${token}: ${value};`)
    .join(' ')
  return `:root { --bsc-page-bg: transparent; --bsc-header-bg: ${GLASS_BAR}; }
@media (prefers-color-scheme: light) and (forced-colors: none) {
  :root { ${inks} }
}`
}

/**
 * The ink tokens our bar draws with, at tokens.css's dark-mode values: what the bar wears on glass
 * while the app is Light. The accent is left alone: its light value, #e64d00, still clears 3:1 on
 * the glass.
 */
export const GLASS_BAR_INKS = {
  '--bsc-text-primary': '#f2f2f2',
  '--bsc-text-secondary': '#a0a0a0',
  '--bsc-text-disabled': '#5c5c5c',
  '--bsc-bg-hover': 'rgb(255 255 255 / 10%)',
  '--bsc-border': 'rgb(255 255 255 / 14%)'
} as const

/**
 * The sheet that carries the chosen picture as `--bsc-picture`: a JPEG main made itself, as a
 * `data:` URI, or `none`. Kept apart from the main page sheet, like `coverCss`, so the picture
 * (a few hundred kilobytes) is inserted once rather than with every settings change.
 *
 * Checked even though main wrote the file, because it is written into CSS: only a base64 JPEG
 * gets through, which cannot close the `url("…")` it sits in.
 */
export function pictureCss(dataUri: string): string {
  const safe = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUri)
  return `html:root { --bsc-picture: ${safe ? `url("${dataUri}")` : 'none'}; }`
}
