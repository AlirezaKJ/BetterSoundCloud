import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { watchSignOutLoop } from './sign-out-loop'

/*
 * Against a stand-in for the content view's webContents that writes down, in order, what main does
 * to it. Like Electron, loading a URL commits it, so `did-navigate` follows every `loadURL`.
 */

const LOGOUT = 'https://soundcloud.com/logout'
const START = 'https://soundcloud.com/discover'

function fakeContent() {
  const emitter = new EventEmitter()
  const steps: string[] = []
  const content = Object.assign(emitter, {
    isDestroyed: () => false,
    loadURL: (url: string) => {
      steps.push(`load ${url}`)
      emitter.emit('did-navigate', {}, url)
      return Promise.resolve()
    },
    navigationHistory: {
      clear: () => {
        steps.push('history cleared')
      }
    },
    session: {
      cookies: {
        remove: (url: string, name: string) => {
          steps.push(`remove ${name} at ${url}`)
          return Promise.resolve()
        },
        flushStore: () => {
          steps.push('flush')
          return Promise.resolve()
        }
      }
    }
  })
  return {
    content: content as unknown as WebContents,
    steps,
    goTo: (url: string) => emitter.emit('did-navigate', {}, url)
  }
}

/** Every fake above answers at once, so one turn of the event loop lets the clearing finish. */
const settle = () => new Promise((resolve) => setImmediate(resolve))

const BREAK_LOOP = [
  'load about:blank',
  'remove oauth_token at https://soundcloud.com/',
  'remove oauth_refresh_token at https://soundcloud.com/',
  'remove _soundcloud_session at https://api-auth.soundcloud.com/',
  'flush',
  `load ${START}`,
  'history cleared'
]

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('watchSignOutLoop', () => {
  it('leaves one sign-out alone, the right-click menu’s included', async () => {
    const { content, steps, goTo } = fakeContent()
    watchSignOutLoop(content, () => START)
    goTo(LOGOUT)
    goTo(START)
    await settle()
    expect(steps).toEqual([])
  })

  it('on a loop, leaves the page before touching a cookie, then opens the start page with no history', async () => {
    const { content, steps, goTo } = fakeContent()
    watchSignOutLoop(content, () => START)
    for (let trip = 0; trip < 3; trip++) goTo(LOGOUT)
    await settle()
    expect(steps).toEqual(BREAK_LOOP)
  })

  it('counts from nothing again after breaking one, so a sign-in it could not clear is tried again', async () => {
    const { content, steps, goTo } = fakeContent()
    watchSignOutLoop(content, () => START)
    for (let trip = 0; trip < 5; trip++) goTo(LOGOUT)
    await settle()
    expect(steps).toEqual(BREAK_LOOP)

    goTo(LOGOUT)
    await settle()
    expect(steps).toEqual([...BREAK_LOOP, ...BREAK_LOOP])
  })
})
