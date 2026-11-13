import {
  artworkColour,
  artworkSources,
  NEUTRAL_BACKDROP,
  showcaseBackdrop,
  showcaseInks
} from '@shared/showcase'
import type { Rgb, ShowcaseInks } from '@shared/showcase'

/*
 * A room painted from the playing track's artwork, for the showcase and the Visualizer's view of
 * its own: the artwork itself, largest first, and one flat colour taken from it with the inks that
 * read on it (src/shared/showcase.ts holds the colour maths, pure and tested).
 */

/** The size the artwork is sampled at for its colour. A handful of pixels is plenty. */
const SAMPLE = 24

export type ArtworkRoom = { readonly artwork: string; readonly inks: ShowcaseInks }

/** No artwork: Dark Shell Grey, and its inks. */
export const NEUTRAL_ROOM: ArtworkRoom = { artwork: '', inks: showcaseInks(NEUTRAL_BACKDROP) }

/**
 * Load a track's artwork (`now-playing`'s 500px URL), the 1080px one first, and take its colour.
 * The neutral room when nothing loads, or when the artwork's pixels cannot be read.
 */
export async function artworkRoom(url: string): Promise<ArtworkRoom> {
  for (const source of artworkSources(url)) {
    const image = await loadImage(source)
    if (!image) continue
    const colour = sampleColour(image) ?? NEUTRAL_BACKDROP
    return { artwork: source, inks: showcaseInks(showcaseBackdrop(colour)) }
  }
  return NEUTRAL_ROOM
}

function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    // SoundCloud's image host answers `Access-Control-Allow-Origin: *` (measured), which is what
    // lets the artwork's pixels be read for its colour.
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      resolve(null)
    }
    image.src = source
  })
}

function sampleColour(image: HTMLImageElement): Rgb | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE
    canvas.height = SAMPLE
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, SAMPLE, SAMPLE)
    return artworkColour(context.getImageData(0, 0, SAMPLE, SAMPLE).data)
  } catch {
    // A canvas the browser will not let us read: the neutral backdrop, not a broken view.
    return null
  }
}
