import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type * as BackgroundModule from './background'

/*
 * The background picture service, with Electron mocked: a temporary profile, a fake open dialog
 * and a fake image decoder. What is tested is what main does with a picture — refuse, shrink,
 * store, read back — not Electron's own decoding.
 */

interface FakeImage {
  isEmpty: () => boolean
  getSize: () => { width: number; height: number }
  resize: (options: { width?: number; height?: number }) => FakeImage
  toJPEG: (quality: number) => Buffer
}

const mocks = vi.hoisted(() => ({
  userData: '',
  showOpenDialog: vi.fn(),
  createFromPath: vi.fn(),
  resized: [] as { width?: number; height?: number }[]
}))

vi.mock('electron', () => ({
  app: { getPath: () => mocks.userData },
  dialog: { showOpenDialog: mocks.showOpenDialog },
  nativeImage: { createFromPath: mocks.createFromPath }
}))

/** A decodable picture of the given size; its "JPEG" names the size it was encoded at. */
function fakeImage(width: number, height: number): FakeImage {
  return {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    resize: (options) => {
      mocks.resized.push(options)
      return fakeImage(options.width ?? width, options.height ?? height)
    },
    toJPEG: () => Buffer.from(`jpeg ${width}x${height}`)
  }
}

const EMPTY: FakeImage = {
  isEmpty: () => true,
  getSize: () => ({ width: 0, height: 0 }),
  resize: () => EMPTY,
  toJPEG: () => Buffer.alloc(0)
}

let background: typeof BackgroundModule
let source: string

beforeEach(async () => {
  mocks.userData = mkdtempSync(join(tmpdir(), 'bsc-background-'))
  mocks.resized = []
  mocks.showOpenDialog.mockReset()
  mocks.createFromPath.mockReset()
  source = join(mocks.userData, 'chosen.png')
  writeFileSync(source, 'not really a png; the decoder is mocked')
  vi.resetModules()
  background = await import('./background')
})

afterEach(() => {
  rmSync(mocks.userData, { recursive: true, force: true })
})

describe('fitWithin', () => {
  it('shrinks the longest side to the limit and keeps the proportions', () => {
    expect(background.fitWithin(6000, 4000, 2560)).toEqual({ width: 2560, height: 1707 })
    expect(background.fitWithin(1000, 5000, 2560)).toEqual({ width: 512, height: 2560 })
  })

  it('never enlarges, and never rounds a side down to nothing', () => {
    expect(background.fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 })
    expect(background.fitWithin(100000, 1, 2560)).toEqual({ width: 2560, height: 1 })
  })
})

describe('choosing a picture', () => {
  it('does nothing when the dialog is cancelled', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await background.choosePicture({} as never)).toEqual({ status: 'cancelled' })
    expect(background.pictureDataUri()).toBe('')
  })

  it('shrinks a large picture and stores it as our own JPEG', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [source] })
    mocks.createFromPath.mockReturnValue(fakeImage(6000, 4000))
    expect(await background.choosePicture({} as never)).toEqual({ status: 'chosen' })
    expect(mocks.resized).toEqual([{ width: 2560, height: 1707, quality: 'good' }])
    expect(readFileSync(background.pictureFile(), 'utf8')).toBe('jpeg 2560x1707')
  })

  it('keeps a picture that already fits at its own size', () => {
    mocks.createFromPath.mockReturnValue(fakeImage(1920, 1080))
    expect(background.storePicture(source)).toEqual({ status: 'chosen' })
    expect(mocks.resized).toEqual([])
  })

  it('refuses a file it cannot decode, and keeps the picture there was', () => {
    mocks.createFromPath.mockReturnValue(fakeImage(1920, 1080))
    background.storePicture(source)
    mocks.createFromPath.mockReturnValue(EMPTY)
    const result = background.storePicture(source)
    expect(result.status).toBe('failed')
    expect(readFileSync(background.pictureFile(), 'utf8')).toBe('jpeg 1920x1080')
  })

  it('refuses a file that is not there', () => {
    const result = background.storePicture(join(mocks.userData, 'gone.jpg'))
    expect(result).toEqual({ status: 'failed', error: 'That file could not be opened.' })
  })
})

describe('reading the picture back', () => {
  it('gives the page a data: URI, and a new one once another picture is chosen', () => {
    mocks.createFromPath.mockReturnValue(fakeImage(1920, 1080))
    background.storePicture(source)
    const first = background.pictureDataUri()
    expect(first).toBe(
      `data:image/jpeg;base64,${Buffer.from('jpeg 1920x1080').toString('base64')}`
    )

    mocks.createFromPath.mockReturnValue(fakeImage(800, 600))
    background.storePicture(source)
    expect(background.pictureDataUri()).not.toBe(first)
  })

  it('has no thumbnail before a picture is chosen', () => {
    mocks.createFromPath.mockReturnValue(EMPTY)
    expect(background.pictureThumbnail()).toBeNull()
  })
})
