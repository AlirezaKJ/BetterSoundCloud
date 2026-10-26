import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CH } from '@shared/ipc'

const SRC = readFileSync(join(import.meta.dirname, 'content.ts'), 'utf8')

/**
 * Code only. This file's own comments discuss `setInterval` and `innerHTML` at length —
 * they are the habits it exists to avoid — so scanning the raw text matches the warning
 * rather than a violation.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * The content preload is the only code that runs inside soundcloud.com, and it is sandboxed.
 * Two things about it are easy to break invisibly, so both are pinned here.
 */
describe('the content preload', () => {
  it('writes its channels out, and keeps them identical to CH', () => {
    // It cannot import `@shared/ipc`: chrome.ts imports it too, and Rollup hoists anything
    // two entries share into a chunk that a sandboxed preload cannot require. So the strings
    // are duplicated on purpose — and this is what stops the copies drifting.
    expect(/const PAGE_THEME_CHANNEL = '([^']+)'/.exec(SRC)?.[1]).toBe(CH.pageTheme)
    expect(/const TRACK_UPDATE_CHANNEL = '([^']+)'/.exec(SRC)?.[1]).toBe(CH.trackUpdate)
  })

  it('does not import @shared/ipc, which would re-create the shared chunk', () => {
    expect(CODE).not.toMatch(/from '@shared\/ipc'/)
  })

  it('never polls', () => {
    // Rule 3 of the content-script contract, and the single worst habit of v0.7.x, which ran
    // four timers on this origin. ESLint covers the bare identifier; this also catches
    // `window.setInterval` and a self-recursive setTimeout.
    expect(CODE).not.toMatch(/setInterval/)
    expect(CODE).not.toMatch(/requestAnimationFrame/)
  })

  it('never writes into SoundCloud’s DOM', () => {
    // Rule 1. Reading computed style and observing mutations is the whole permitted surface.
    for (const forbidden of [
      'innerHTML',
      'insertAdjacentHTML',
      'appendChild',
      'setAttribute'
    ]) {
      expect(CODE).not.toContain(forbidden)
    }
  })

  it('ignores page lifecycle events the page makes up, and survives the back/forward cache', () => {
    // Measured: one `dispatchEvent(new PageTransitionEvent('pagehide'))` from any script on
    // soundcloud.com used to switch every watcher off for the rest of the session. Only a
    // browser-fired (`isTrusted`) event may tear down or re-report, and entering the
    // back/forward cache (`persisted`) must not tear down at all.
    const listenerFor = (type: string): string => {
      const at = CODE.indexOf(`addEventListener('${type}'`)
      expect(at, type).toBeGreaterThan(-1)
      return CODE.slice(at, at + 160)
    }
    expect(listenerFor('pagehide')).toMatch(/event\.isTrusted && !event\.persisted/)
    expect(listenerFor('pageshow')).toMatch(/!event\.isTrusted \|\| !event\.persisted/)
    // The old binding tore down on the first pagehide of any kind.
    expect(CODE).not.toContain("addEventListener('pagehide', teardown")
  })

  it('has no part in the right-click menu', () => {
    // The menu is driven entirely from main's `context-menu` event (src/main/context-menu.ts).
    // v0.7.x needed a script inside the page just to learn when to dismiss its menu; v2 needs
    // nothing here, and this keeps it that way.
    expect(CODE).not.toMatch(/context-?menu/i)
  })
})

describe('the built preloads', () => {
  const dir = join(import.meta.dirname, '../../out/preload')

  it.runIf(existsSync(dir))('are each a single self-contained file', () => {
    // A sandboxed preload resolves `require` against Electron's allowlist only, so a relative
    // chunk makes it fail to load entirely — and the failure is silent unless you read the
    // console. Measured once already: it broke the theme reporting the moment this preload
    // started using a shared import.
    expect(existsSync(join(dir, 'chunks'))).toBe(false)
    const files = readdirSync(dir)
    expect(files.sort()).toEqual(['chrome.cjs', 'content.cjs'])
  })
})
