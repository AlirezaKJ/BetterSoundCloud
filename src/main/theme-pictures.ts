import { app, nativeImage } from 'electron'
import type { NativeImage, WebContents } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readRecord, writeJson } from './json-file'
import { composeLayers, mostlyOneColour, pictureBox } from '@shared/theme-pictures'
import type { Box, PictureLayer } from '@shared/theme-pictures'

/*
 * A picture of each theme for the gallery in Settings → Themes: the app's window wearing it.
 *
 * The built-in themes ship one (resources/theme-pictures/<id>.jpg): the maintainer's own
 * full-screen screenshots, 2026-11-15, shrunk to this size. Once the user has had a theme
 * on, their own window wearing it takes that picture's place: the first time a theme is on screen,
 * and again whenever its CSS has changed since (an edited copy, a saved file), main takes a
 * picture a few seconds after the page settles. The maintainer chose this, 2026-11-14: real
 * pictures, the user's own. They stay in the profile and never leave the computer.
 *
 * A picture is the whole window, as the theme dresses it: our bar (while it shows) over
 * SoundCloud's whole page, each captured where it sits and put together here. Never a corner of
 * it: the maintainer asked for the whole interface, not zoomed-in pictures (2026-11-14). Settings,
 * the panels and the overlays drawn over the page are left out; the page under Settings is
 * captured as it is.
 */

/** Wide enough for a card two to a row at twice the pixels, small enough to send. */
const PICTURE_WIDTH = 720
const JPEG_QUALITY = 82
/** After a theme change or a page load: images and late layout have settled by then. */
const SETTLE_MS = 4000
/**
 * Part of what a picture was taken of, beside the theme's CSS: a picture framed another way
 * (the first pictures were the page's top-left corner) is taken again.
 */
const FRAMING = 'whole window'

/** The window's inside and the views to picture, bottom first, where `layout()` put them. */
export interface PictureFrame {
  width: number
  height: number
  views: { contents: WebContents; bounds: Box }[]
}

/** Where the shipped pictures live, next to the built-in themes. */
function shippedDir(): string {
  return join(import.meta.dirname, '../../resources/theme-pictures')
}

/** Where the user's own pictures live, with `index.json` recording which CSS each was taken of. */
function ownDir(): string {
  return join(app.getPath('userData'), 'theme-pictures')
}

/** A theme id is a file name the user chose: never let it into a path. */
function ownFile(id: string): string {
  return join(ownDir(), `${hash(`id:${id}`).slice(0, 16)}.jpg`)
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function dataUri(path: string): string | null {
  try {
    return `data:image/jpeg;base64,${readFileSync(path).toString('base64')}`
  } catch {
    return null
  }
}

/** Each theme's picture as a `data:` URI: the user's own, else the shipped one, else none. */
export function themePictures(ids: readonly string[]): Record<string, string> {
  const pictures: Record<string, string> = {}
  for (const id of ids) {
    const own = existsSync(ownFile(id)) ? dataUri(ownFile(id)) : null
    // Shipped pictures are named by the built-in theme's id, which never holds a path separator.
    const shipped = /^[a-z0-9-]+$/.test(id) ? dataUri(join(shippedDir(), `${id}.jpg`)) : null
    const picture = own ?? shipped
    if (picture) pictures[id] = picture
  }
  return pictures
}

let pending: ReturnType<typeof setTimeout> | null = null

/**
 * The theme now on SoundCloud's page, after a load or a settings change. In a few seconds, if
 * it is still the one on screen and nothing else covers the page (`canTake`), take its picture —
 * unless one of exactly this CSS was taken before. `onSaved` runs when a new picture is written.
 */
export function noteThemeOnPage(options: {
  page: WebContents
  frame: () => PictureFrame
  id: string
  css: string
  canTake: () => boolean
  onSaved: () => void
}): void {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    void takePicture(options)
  }, SETTLE_MS)
}

async function takePicture({
  page,
  frame,
  id,
  css,
  canTake,
  onSaved
}: Parameters<typeof noteThemeOnPage>[0]): Promise<void> {
  if (page.isDestroyed() || !canTake()) return
  const index = readRecord(join(ownDir(), 'index.json'))
  const taken = hash(`${FRAMING}
${css}`)
  if (index[id] === taken && existsSync(ownFile(id))) return

  const { width, height, views } = frame()
  if (width <= 0 || height <= 0) return
  // Every view at the same moment, so the bar and the page show the same theme.
  const images = await Promise.all(
    views.map((view) => view.contents.capturePage().catch(() => null))
  )
  // A page that has not painted yet, or a window that was hidden meanwhile, gives nothing; a
  // page still loading gives one flat colour. Taken next time instead.
  const pageImage = images[views.findIndex((view) => view.contents === page)]
  if (!pageImage || pageImage.isEmpty() || !canTake()) return
  if (mostlyOneColour(pageImage.resize({ width: 32 }).toBitmap())) return

  const scale = PICTURE_WIDTH / width
  const layers: PictureLayer[] = []
  views.forEach((view, i) => {
    const layer = scaledLayer(images[i], pictureBox(view.bounds, scale))
    if (layer) layers.push(layer)
  })
  const pictureHeight = Math.round(height * scale)
  const jpeg = nativeImage
    .createFromBitmap(Buffer.from(composeLayers(PICTURE_WIDTH, pictureHeight, layers)), {
      width: PICTURE_WIDTH,
      height: pictureHeight
    })
    .toJPEG(JPEG_QUALITY)

  mkdirSync(ownDir(), { recursive: true })
  // Written aside and renamed into place, so a crash never leaves half a picture.
  const file = ownFile(id)
  writeFileSync(`${file}.tmp`, jpeg)
  renameSync(`${file}.tmp`, file)
  writeJson(join(ownDir(), 'index.json'), { ...index, [id]: taken })
  onSaved()
}

/** A view's capture, shrunk to exactly its place in the picture. */
function scaledLayer(image: NativeImage | null | undefined, box: Box): PictureLayer | null {
  if (!image || image.isEmpty() || box.width <= 0 || box.height <= 0) return null
  const bitmap = image
    .resize({ width: box.width, height: box.height, quality: 'good' })
    .toBitmap()
  return { ...box, bitmap }
}
