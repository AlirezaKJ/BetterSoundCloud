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
 * Page width, in CSS pixels, below which the header cannot spare room for our buttons.
 *
 * Measured on the live logged-in page, header height at each viewport width:
 *
 * ```
 * viewport        1240  1150  1100  1000   900   814
 * stock             46    46    46    46    46    46
 * + our padding     46    46    46    92    92    92
 * ```
 *
 * SoundCloud's header is `flex-wrap: nowrap` and steps its container 1240 -> 1080 -> 960,
 * so it never breaks itself. Take 144px out of it below ~1100 and the contents wrap out of
 * the 46px bar and land on top of the page, where they cover the page and swallow clicks.
 * So below this width we simply do not ask for the space.
 */
export const RESERVATION_MIN_WIDTH = 1100

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
   * CSS pixels to reserve at the right end of the header for our window buttons,
   * or null when the embedded buttons are not showing.
   */
  reserve: number | null
}

export function buildContentCss({
  fullWidth,
  reserve,
  theme,
  playerReserve
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
    rules.push(
      `@media (min-width: ${RESERVATION_MIN_WIDTH}px) {
         .header__inner { padding-right: ${reserve}px !important; }
       }`
    )

    // With our own bar hidden, SoundCloud's header IS the titlebar, so it should behave
    // like one. Every descendant is explicitly `no-drag`, so only the bare background
    // between their controls becomes a grab handle — links, the search field and their
    // buttons all keep working. The `*` is what makes this safe: there is no element it
    // can miss.
    //
    // If `.header` is ever renamed the window simply stops being draggable there, which
    // is why the overlay keeps its own small handle around the buttons as a fallback.
    rules.push(
      '.header { -webkit-app-region: drag; }\n' + '.header * { -webkit-app-region: no-drag; }'
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
