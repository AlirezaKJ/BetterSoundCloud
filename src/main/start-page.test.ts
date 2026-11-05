import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'

/*
 * Against a real profile folder (a temporary one) and a stand-in for the content view's
 * webContents, so the file on disk is checked as written.
 */

const profile = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => profile.dir } }))

import { rememberLastPage, startUrl } from './start-page'

const file = () => join(profile.dir, 'last-page.json')
const saved = () => (JSON.parse(readFileSync(file(), 'utf8')) as { url: string }).url

/** The two navigation events, as Electron emits them. */
function fakeContent() {
  const emitter = new EventEmitter()
  return {
    webContents: emitter as unknown as WebContents,
    goTo: (url: string) => emitter.emit('did-navigate', {}, url),
    goInPage: (url: string, isMainFrame = true) =>
      emitter.emit('did-navigate-in-page', {}, url, isMainFrame),
    destroy: () => emitter.emit('destroyed')
  }
}

beforeEach(() => {
  profile.dir = mkdtempSync(join(tmpdir(), 'bsc-start-page-'))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(profile.dir, { recursive: true, force: true })
})

describe('startUrl', () => {
  it('opens the fixed choices on their own pages, never the remembered one', () => {
    writeFileSync(file(), JSON.stringify({ url: 'https://soundcloud.com/a/b' }))
    expect(startUrl('discover')).toBe('https://soundcloud.com/discover')
    expect(startUrl('library')).toBe('https://soundcloud.com/you/library')
  })

  it('reopens the remembered page for "Where you left off"', () => {
    writeFileSync(file(), JSON.stringify({ url: 'https://soundcloud.com/a/b?in=a/sets/c' }))
    expect(startUrl('lastVisited')).toBe('https://soundcloud.com/a/b?in=a/sets/c')
  })

  it('opens Home when nothing is remembered, or the file is broken or edited', () => {
    expect(startUrl('lastVisited')).toBe('https://soundcloud.com/discover')
    writeFileSync(file(), 'not json')
    expect(startUrl('lastVisited')).toBe('https://soundcloud.com/discover')
    writeFileSync(file(), JSON.stringify({ url: 'https://example.com/' }))
    expect(startUrl('lastVisited')).toBe('https://soundcloud.com/discover')
  })
})

describe('rememberLastPage', () => {
  it('saves the page SoundCloud settles on, once', () => {
    const content = fakeContent()
    rememberLastPage(content.webContents)

    content.goTo('https://soundcloud.com/discover')
    vi.advanceTimersByTime(300)
    content.goInPage('https://soundcloud.com/a/b')
    vi.advanceTimersByTime(900)
    expect(existsSync(file())).toBe(false)

    vi.advanceTimersByTime(100)
    expect(saved()).toBe('https://soundcloud.com/a/b')
    expect(startUrl('lastVisited')).toBe('https://soundcloud.com/a/b')
  })

  it('ignores frames inside the page, and pages it must not reopen', () => {
    const content = fakeContent()
    rememberLastPage(content.webContents)
    content.goTo('https://soundcloud.com/a/b')
    vi.advanceTimersByTime(1_000)

    content.goInPage('https://soundcloud.com/some-embed', false)
    content.goTo('https://soundcloud.com/logout')
    content.goTo('https://secure.soundcloud.com/web-auth')
    vi.advanceTimersByTime(1_000)
    expect(saved()).toBe('https://soundcloud.com/a/b')
  })

  it('saves at once when the page goes away, rather than waiting', () => {
    const content = fakeContent()
    rememberLastPage(content.webContents)
    content.goInPage('https://soundcloud.com/you/likes')
    content.destroy()
    expect(saved()).toBe('https://soundcloud.com/you/likes')
  })
})
