import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebContentsView } from 'electron'
import type * as ChromeThemeModule from './chrome-theme'

/*
 * chrome-theme only ever calls four things on a view's webContents, so a fake with those four
 * is enough. Each fake records what happened to it, in order, and lets a test decide when an
 * insertCSS call finishes — which is how the out-of-order case below is reproduced.
 */

type Pending = { css: string; resolve: (key: string) => void }

function fakeView() {
  const listeners = new Map<string, () => void>()
  const log: string[] = []
  const pending: Pending[] = []
  let destroyed = false
  let next = 0
  const webContents = {
    on: (event: string, cb: () => void) => listeners.set(event, cb),
    once: (event: string, cb: () => void) => listeners.set(event, cb),
    isDestroyed: () => destroyed,
    insertCSS: (css: string) =>
      new Promise<string>((resolve) => {
        const key = `k${++next}`
        pending.push({
          css,
          resolve: () => {
            log.push(`insert ${key} ${css}`)
            resolve(key)
          }
        })
      }),
    removeInsertedCSS: (key: string) => {
      log.push(`remove ${key}`)
      return Promise.resolve()
    }
  }
  return {
    view: { webContents } as unknown as WebContentsView,
    log,
    pending,
    load: () => listeners.get('did-finish-load')?.(),
    destroy: () => {
      destroyed = true
      listeners.get('destroyed')?.()
    },
    /** Let every insertCSS in flight finish, oldest first, and the follow-up work run. */
    settle: async () => {
      while (pending.length) pending.shift()!.resolve('')
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

let chrome: typeof ChromeThemeModule

beforeEach(async () => {
  vi.resetModules()
  chrome = await import('./chrome-theme')
})

describe('themeChromeView', () => {
  it('gives each kind of view its own CSS, on load and on every theme change', async () => {
    const header = fakeView()
    const menu = fakeView()
    chrome.themeChromeView(header.view, 'header')
    chrome.themeChromeView(menu.view, 'menu')
    chrome.setChromeTheme((kind) => `.${kind}{}`)
    await header.settle()
    await menu.settle()
    expect(header.log).toEqual(['insert k1 .header{}'])
    expect(menu.log).toEqual(['insert k1 .menu{}'])
  })

  it('inserts the new stylesheet before removing the old, so a save never flashes', async () => {
    const view = fakeView()
    chrome.themeChromeView(view.view, 'settings')
    chrome.setChromeTheme(() => '.a{}')
    await view.settle()
    chrome.setChromeTheme(() => '.b{}')
    await view.settle()
    expect(view.log).toEqual(['insert k1 .a{}', 'insert k2 .b{}', 'remove k1'])
  })

  it('re-applies on a new document, and still removes the sheet it inserted while loading', async () => {
    // At startup the theme is applied while the view is still loading, so that sheet lands in
    // the very document did-finish-load then reports. Forgetting its key left it stuck there.
    const view = fakeView()
    chrome.themeChromeView(view.view, 'header')
    chrome.setChromeTheme(() => '.a{}')
    await view.settle()
    view.load()
    await view.settle()
    chrome.setChromeTheme(() => '.b{}')
    await view.settle()
    expect(view.log).toEqual([
      'insert k1 .a{}',
      'insert k2 .a{}',
      'remove k1',
      'insert k3 .b{}',
      'remove k2'
    ])
  })

  it('keeps only the newest theme when two changes overlap', async () => {
    // Two saves in quick succession: the first insert finishes after the second was asked for.
    const view = fakeView()
    chrome.themeChromeView(view.view, 'header')
    chrome.setChromeTheme(() => '.old{}')
    chrome.setChromeTheme(() => '.new{}')
    const [first, second] = view.pending
    second!.resolve('')
    await new Promise((resolve) => setTimeout(resolve, 0))
    first!.resolve('')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(view.log).toEqual(['insert k2 .new{}', 'insert k1 .old{}', 'remove k1'])
  })

  it('removes the theme and inserts nothing when the new theme has no CSS for the view', async () => {
    const view = fakeView()
    chrome.themeChromeView(view.view, 'status')
    chrome.setChromeTheme(() => '.a{}')
    await view.settle()
    chrome.setChromeTheme(() => '')
    await view.settle()
    expect(view.log).toEqual(['insert k1 .a{}', 'remove k1'])
  })

  it('forgets a view once it is destroyed', async () => {
    const view = fakeView()
    chrome.themeChromeView(view.view, 'menu')
    view.destroy()
    chrome.setChromeTheme(() => '.a{}')
    await view.settle()
    expect(view.log).toEqual([])
  })
})
