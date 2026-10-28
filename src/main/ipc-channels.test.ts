import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { CH } from '@shared/ipc'

/*
 * Every channel in CH has both of its ends.
 *
 * A channel is a contract between two processes that no type checks across. A channel a preload
 * sends that main never handles fails without a sound (an `invoke` simply never answers), and so
 * does a push main sends that no preload listens for, or a handler nothing calls. So this reads
 * the source, as content.test.ts and window.test.ts pin structure: main's handlers and pushes
 * (src/main), and the two preloads' sends, invokes and subscriptions.
 */

type Channel = keyof typeof CH

const ROOT = join(import.meta.dirname, '..')

/** Code only: comments here and there mention channels they do not use. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const MAIN = readdirSync(join(ROOT, 'main'))
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => code(join(ROOT, 'main', name)))
  .join('\n')
const CHROME = code(join(ROOT, 'preload/chrome.ts'))
const CONTENT = code(join(ROOT, 'preload/content.ts'))

/** Every `CH.name` the pattern finds, in order, repeats kept. `\s*` spans line breaks. */
function channels(source: string, before: string): Channel[] {
  const pattern = new RegExp(`${before}\\(\\s*CH\\.(\\w+)`, 'g')
  return [...source.matchAll(pattern)].map((m) => m[1] as Channel)
}

/**
 * SoundCloud's page preload writes its channel names as literals, not `CH.*`: importing CH there
 * would split a shared chunk that a sandboxed preload cannot load (CLAUDE.md §5).
 */
const contentSends: Channel[] = [...CONTENT.matchAll(/_CHANNEL = '([^']+)'/g)].map((m) => {
  const name = Object.entries(CH).find(([, value]) => value === m[1])?.[0]
  if (!name) throw new Error(`content.ts uses '${m[1]}', which is not in CH`)
  return name as Channel
})

const handled = channels(MAIN, 'ipcMain\\.(?:on|handle|once)')
const pushed = new Set(channels(MAIN, '\\.send'))
const asked = new Set([...channels(CHROME, 'ipcRenderer\\.(?:send|invoke)'), ...contentSends])
const listened = new Set(channels(CHROME, '(?:subscribe|ipcRenderer\\.on)'))

const missing = (from: Set<Channel>, to: Iterable<Channel>) =>
  [...from].filter((channel) => ![...to].includes(channel)).sort()

describe('every IPC channel', () => {
  it('is found by these scans at all', () => {
    // Patterns that stopped matching would find nothing, and every check below would pass on
    // empty sets. One known channel of each kind keeps them honest.
    expect(handled).toContain('settingsSet')
    expect(handled).toContain('pluginSetEnabled') // registered across two lines
    expect(pushed).toContain('settingsChanged')
    expect(asked).toContain('settingsSet')
    expect(asked).toContain('trackUpdate') // from SoundCloud's page, as a literal
    expect(listened).toContain('focusArrived') // the preload's own listener
  })

  it('that a view sends or asks on has a handler in main', () => {
    expect(missing(asked, handled)).toEqual([])
  })

  it('that main handles is used by a view, so no handler is dead', () => {
    expect(missing(new Set(handled), asked)).toEqual([])
  })

  it('has one handler, not two', () => {
    // A second `ipcMain.handle` for a channel throws at startup; a second `on` runs twice.
    const twice = handled.filter((channel, index) => handled.indexOf(channel) !== index)
    expect(twice).toEqual([])
  })

  it('that main pushes is listened for by our views, and the other way round', () => {
    expect(missing(pushed, listened)).toEqual([])
    expect(missing(listened, pushed)).toEqual([])
  })

  it('in CH is used at all', () => {
    const used = new Set([...handled, ...pushed, ...asked, ...listened])
    expect(missing(new Set(Object.keys(CH) as Channel[]), used)).toEqual([])
  })

  it('is named through CH in main, so this test sees every one', () => {
    // A push written as `.send(someVariable, …)` would slip past every check above.
    expect(MAIN).not.toMatch(/\.send\(\s*(?!CH\.)[A-Za-z_$][\w$]*\s*,/)
  })
})
