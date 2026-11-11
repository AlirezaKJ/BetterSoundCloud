import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { BaseWindow } from 'electron'
import { GLASS_PLATFORMS } from '@shared/glass'
import { isDev } from './env'

/**
 * Glass under our window: the native half (native/window-glass, built by
 * scripts/build-native.mjs into resources/native/window-glass.node).
 *
 * Why native at all, measured 2026-11-10 on a frameless BaseWindow shaped like ours:
 *
 * - Electron's own `setBackgroundMaterial('acrylic')` shows glass only while the window is the
 *   foreground window. DWM swaps it for a flat grey within a second of focus going elsewhere, and
 *   answering WM_NCACTIVATE as "active" (three variants, from a subclass) did not change that:
 *   DWM tracks activation itself for its system backdrops.
 * - `'mica'` rendered as flat #202020 on a frameless window, focused or not. (Passed to the
 *   constructor it even came out as Acrylic.)
 * - A host backdrop brush, the one Windows Settings uses, stays live in both states. The addon
 *   draws one under the window's own content, in our own process, and opts the window in with
 *   DWMWA_USE_HOSTBACKDROPBRUSH, which only the window's own process can set.
 *
 * Optional by design: if the addon is missing (a build without the C++ tools), fails to load, or
 * refuses, the app runs exactly as without Glass.
 */

type Addon = {
  enable(handle: Buffer, tint: number): boolean
  setTint(handle: Buffer, tint: number): boolean
  disable(handle: Buffer): boolean
  status(): string
}

let addon: Addon | null | undefined

function load(): Addon | null {
  if (addon !== undefined) return addon
  addon = null
  if (!GLASS_PLATFORMS.includes(process.platform)) return addon
  try {
    // In a packaged app this resolves inside app.asar; electron-builder unpacks the file
    // (asarUnpack) and Electron's loader follows it to app.asar.unpacked.
    const path = join(import.meta.dirname, '../../resources/native/window-glass.node')
    addon = createRequire(import.meta.url)(path) as Addon
  } catch (error) {
    console.warn('[glass] the native layer is not available:', (error as Error).message)
  }
  return addon
}

/** Whether this build, on this machine, can draw glass. */
export function glassAvailable(): boolean {
  return load() !== null
}

/**
 * Turn the window's glass on with `tint` (0xAARRGGBB, `glassTint`), change its tint, or turn it
 * off with null. Returns whether glass is now under the window, so the caller makes the window
 * and its views see-through only when there is something to see.
 */
export function setWindowGlass(window: BaseWindow, tint: number | null): boolean {
  const native = load()
  if (!native || window.isDestroyed()) return false
  const handle = window.getNativeWindowHandle()
  try {
    if (tint === null) {
      native.disable(handle)
      return false
    }
    const on = native.enable(handle, tint)
    if (isDev) setTimeout(() => console.log(`[glass] ${native.status()}`), 500)
    return on
  } catch (error) {
    console.warn('[glass] could not change the window’s glass:', (error as Error).message)
    return false
  }
}
