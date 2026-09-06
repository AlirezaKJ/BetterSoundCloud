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
   * The selected theme's CSS, or empty for none. Appended last so a theme can override the
   * rules above it — a theme author who wants a different scrollbar should be able to have
   * one without us curating an exception for it.
   */
  theme?: string
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
  reserve: number | null
}

export function buildContentCss({
  fullWidth,
  reserve,
  theme,
  playerReserve,
  compactHeader,
  fitHeader
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
     ::-webkit-scrollbar-thumb:active { background: #f50; }`
  ]

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

  // Last, so a theme can override everything above it. A theme author who wants a different
  // scrollbar should get one without us curating an exception for it.
  if (theme) rules.push(theme)

  return rules.join('\n')
}
