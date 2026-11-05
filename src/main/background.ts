import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, dialog, nativeImage } from 'electron'
import type { BaseWindow } from 'electron'
import { isDev } from './env'

/**
 * The picture behind SoundCloud's page, when the Background setting is "A picture of your own".
 *
 * v0.7.x had a static background before it switched to the playing track's artwork, and left a
 * note to bring the choice back as a setting; this is that. Main owns the whole path: the
 * settings panel asks main to show the open dialog and never handles a file path itself, so a
 * compromised view cannot make main read an arbitrary file into the page.
 *
 * The chosen file is decoded, shrunk to at most `PICTURE_MAX_SIDE` and stored as our own JPEG in
 * the profile, so the page only ever receives a modest image main made, whatever was picked —
 * a 40-megapixel photo would otherwise travel into the page in full on every load. It reaches
 * the page as a `data:` URI in its own small stylesheet (`pictureCss` in content-css.ts).
 */

/** The longest side a picture is stored at. Blurred and faded behind the page, more is waste. */
export const PICTURE_MAX_SIDE = 2560
/** Files larger than this are refused before decoding, so a huge one cannot exhaust memory. */
export const PICTURE_MAX_BYTES = 50 * 1024 * 1024
/** The picture as stored, and the thumbnail the settings panel shows. */
const PICTURE_QUALITY = 85
const THUMBNAIL_WIDTH = 240

export type ChooseResult =
  | { readonly status: 'chosen' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: string }

/** Where the stored picture lives: one file, replaced each time a new one is chosen. */
export function pictureFile(): string {
  return join(app.getPath('userData'), 'background-picture.jpg')
}

/**
 * `width` × `height` scaled to fit inside a `max` × `max` square, keeping its proportions.
 * Never enlarges, and never rounds a side down to nothing. Pure, so it is tested directly.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

/** The stored picture as a `data:` URI, read once and kept, or '' when there is none. */
let cached: string | null = null

export function pictureDataUri(): string {
  if (cached === null) {
    try {
      cached = `data:image/jpeg;base64,${readFileSync(pictureFile()).toString('base64')}`
    } catch {
      cached = '' // no picture chosen yet, the normal case
    }
  }
  return cached
}

/** A small preview of the stored picture for the settings panel, or null when there is none. */
export function pictureThumbnail(): string | null {
  const image = nativeImage.createFromPath(pictureFile())
  if (image.isEmpty()) return null
  const thumbnail = image.resize({ width: THUMBNAIL_WIDTH, quality: 'good' })
  return `data:image/jpeg;base64,${thumbnail.toJPEG(PICTURE_QUALITY).toString('base64')}`
}

/** Ask for a picture with the system's open dialog, then store it. */
export async function choosePicture(window: BaseWindow): Promise<ChooseResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Choose a background picture',
    properties: ['openFile'],
    // JPEG and PNG only: they are what Electron can decode here, and decoding is how the
    // picture gets shrunk. Anything else would have to go into the page as it came.
    filters: [{ name: 'Pictures', extensions: ['jpg', 'jpeg', 'png'] }]
  })
  const path = filePaths[0]
  if (canceled || !path) return { status: 'cancelled' }
  return storePicture(path)
}

/** Decode, shrink and store one picture as the background. Exported for the tests. */
export function storePicture(path: string): ChooseResult {
  try {
    if (statSync(path).size > PICTURE_MAX_BYTES) {
      return { status: 'failed', error: 'That picture is too large. Choose one under 50 MB.' }
    }
  } catch {
    return { status: 'failed', error: 'That file could not be opened.' }
  }

  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) {
    return { status: 'failed', error: 'That file is not a picture BetterSoundCloud can read.' }
  }

  const size = image.getSize()
  const fit = fitWithin(size.width, size.height, PICTURE_MAX_SIDE)
  const scaled = fit.width === size.width ? image : image.resize({ ...fit, quality: 'good' })
  const jpeg = scaled.toJPEG(PICTURE_QUALITY)

  // A temporary file renamed over the old one, so a failed write leaves the previous picture.
  const target = pictureFile()
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(`${target}.tmp`, jpeg)
    renameSync(`${target}.tmp`, target)
  } catch (error) {
    return { status: 'failed', error: `The picture could not be saved: ${String(error)}` }
  }
  cached = null
  if (isDev) {
    const kb = Math.round(jpeg.length / 1024)
    console.log(`[background] picture stored: ${fit.width}x${fit.height}, ${kb} KB`)
  }
  return { status: 'chosen' }
}
