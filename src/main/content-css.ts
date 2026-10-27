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
   * CSS pixels to reserve at the right-hand end of the play controls for our own buttons,
   * or null when they are switched off.
   */
  playerReserve?: number | null
  /** Override SoundCloud's centred container so the bars span the window. */
  fullWidth: boolean
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
  if (background) rules.push(background)

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
