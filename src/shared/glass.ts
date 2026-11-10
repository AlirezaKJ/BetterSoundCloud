/**
 * The Glass setting (`appearance.glass`): pure pieces shared by main and the settings panel.
 *
 * Glass is a live, blurred view of whatever is behind the window, drawn under all of our views by
 * native/window-glass (Windows 11 only, CLAUDE.md §17 "Glass"). These helpers only decide numbers
 * and say where it can work; they know nothing about Electron.
 */

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
