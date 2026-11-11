/**
 * The Glass setting (`appearance.glass`): pure pieces shared by main and the settings panel.
 *
 * Glass is a live, blurred view of whatever is behind the window, drawn under all of our views by
 * native/window-glass (Windows 11 only, CLAUDE.md §17 "Glass"). These helpers only decide numbers
 * and say where it can work; they know nothing about Electron.
 */

import type { PageTheme } from './page-theme'

/** Where glass can be drawn at all: the native layer is Windows-only. */
export const GLASS_PLATFORMS: readonly string[] = ['win32']

/**
 * The tint laid over the blur, as the native layer wants it: 0xAARRGGBB. `strength` is the
 * Glass tint setting, 0–100 percent of a near-black, so 0 is untinted glass (bright wallpapers
 * then wash out SoundCloud's light text) and 100 hides the glass entirely.
 *
 * Near-black rather than SoundCloud's #121212 on purpose: the tint is the only thing between the
 * desktop and SoundCloud's text, and a slightly darker one buys contrast at the same strength.
 */
export function glassTint(strength: number): number {
  const percent = Math.min(Math.max(Number.isFinite(strength) ? strength : 0, 0), 100)
  const alpha = Math.round((percent / 100) * 255)
  // >>> 0 keeps it an unsigned 32-bit number for the native side.
  return ((alpha << 24) | 0x0e0e0e) >>> 0
}

/**
 * The mode SoundCloud's page and the overlays on its bars are drawn in. **Glass is dark**: its
 * tint is a near-black (`glassTint`), so on glass the page is SoundCloud's dark mode whatever
 * SoundCloud's own setting or the theme's `@mode` says — SoundCloud's light mode left dark text on
 * the dark glass. Otherwise it is the theme's `@mode`, or null to follow SoundCloud.
 */
export function pageMode(glass: boolean, themeMode: PageTheme | null): PageTheme | null {
  return glass ? 'dark' : themeMode
}

/**
 * Whether Glass is under the window, and if not, why not, for the line under the setting
 * (`statusFrom: 'glass'`). Read by main (`glassStatus` in index.ts) in this order: the first that
 * applies is the answer.
 */
export type GlassStatus =
  /** The setting is off. */
  | 'off'
  /** Glass is under the window. */
  | 'on'
  /** Started with `--safe-mode`, which turns hardware acceleration off for the launch. */
  | 'safe-mode'
  /** Hardware acceleration is off (Advanced), and Glass needs it. */
  | 'no-acceleration'
  /** Hardware acceleration was turned back on, but only comes back after a restart. */
  | 'restart'
  /** This build has no native layer (built without the C++ tools). */
  | 'not-built'
  /** The native layer was there and Windows refused it: before Windows 11. */
  | 'refused'

/**
 * The words of Glass's status line (DESIGN.md, "The status line"), or null for no line. It speaks
 * only when the box is ticked and there is no glass: glass that is there shows itself, and an
 * unticked box already says it is off.
 */
export function describeGlassStatus(
  status: GlassStatus
): { lead: string; detail: string } | null {
  switch (status) {
    case 'off':
    case 'on':
      return null
    case 'safe-mode':
      return {
        lead: 'Off in safe mode',
        detail:
          'Safe mode turns off hardware acceleration, which Glass needs. Start BetterSoundCloud normally to see it.'
      }
    case 'no-acceleration':
      return {
        lead: 'Not showing',
        detail: 'Glass needs hardware acceleration, which is off in Advanced.'
      }
    case 'restart':
      return {
        lead: 'Not showing yet',
        detail:
          'Hardware acceleration comes back when BetterSoundCloud restarts, and Glass with it.'
      }
    case 'not-built':
      return {
        lead: 'Not in this copy',
        detail: 'It was built without Glass’s Windows part (npm run native:build).'
      }
    case 'refused':
      return {
        lead: 'Not showing',
        detail: 'Windows didn’t draw it. Glass needs Windows 11.'
      }
  }
}
