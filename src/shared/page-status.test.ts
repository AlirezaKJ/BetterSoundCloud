import { describe, it, expect } from 'vitest'
import {
  describeComponentsError,
  describeLoadFailure,
  describePageStatus,
  hidesPage,
  isPageStatusAction,
  PAGE_STATUS_ACTIONS,
  retryDelay
} from './page-status'
import type { PageStatus } from './page-status'

/** One of every kind, so a new kind without wording fails here rather than on screen. */
const EVERY_STATUS: PageStatus[] = [
  { kind: 'setting-up', slow: false },
  { kind: 'setting-up', slow: true },
  { kind: 'loading' },
  { kind: 'setup-failed', detail: 'Update check error' },
  { kind: 'load-failed', code: -106, error: 'ERR_INTERNET_DISCONNECTED', retrying: false },
  { kind: 'load-failed', code: -106, error: 'ERR_INTERNET_DISCONNECTED', retrying: true },
  { kind: 'crashed', reason: 'oom' },
  { kind: 'unresponsive' }
]

describe('describePageStatus', () => {
  it('gives every status a title and a body, and buttons only for actions that exist', () => {
    for (const status of EVERY_STATUS) {
      const message = describePageStatus(status)
      expect(message.title, status.kind).not.toBe('')
      expect(message.body, status.kind).not.toBe('')
      for (const button of message.buttons) {
        expect(PAGE_STATUS_ACTIONS).toContain(button.action)
        expect(button.label).not.toBe('')
      }
    }
  })

  it('never shows a dead end: anything that is not progress offers a way forward', () => {
    // "Say what does not work" is only half the rule; the other half is saying what to do.
    for (const status of EVERY_STATUS) {
      const message = describePageStatus(status)
      if (!message.waiting) expect(message.buttons.length, status.kind).toBeGreaterThan(0)
    }
  })

  it('keeps the product’s plain voice: no exclamation marks, no capitals for emphasis', () => {
    for (const status of EVERY_STATUS) {
      const { title, body } = describePageStatus(status)
      expect(title).not.toMatch(/!/)
      expect(body).not.toMatch(/!/)
      expect(title).not.toBe(title.toUpperCase())
    }
  })

  it('does not offer a restart while a first-run download is still going normally', () => {
    // Restarting throws the download away. It is the way out of a stuck install, not a
    // button to press during a healthy one.
    expect(describePageStatus({ kind: 'setting-up', slow: false }).buttons).toEqual([])
    expect(
      describePageStatus({ kind: 'setting-up', slow: true }).buttons.map((b) => b.action)
    ).toEqual(['restart'])
  })

  it('offers restart and quit when Widevine failed, and says why SoundCloud stays closed', () => {
    const message = describePageStatus({ kind: 'setup-failed', detail: 'Update check error' })
    expect(message.buttons.map((b) => b.action)).toEqual(['restart', 'quit'])
    expect(message.body).toMatch(/silently skip/)
    expect(message.detail).toBe('Update check error')
  })

  it('disables Try again while a retry is in flight, so a double click is one request', () => {
    const idle = describePageStatus({
      kind: 'load-failed',
      code: -105,
      error: 'ERR_NAME_NOT_RESOLVED',
      retrying: false
    })
    const busy = describePageStatus({
      kind: 'load-failed',
      code: -105,
      error: 'ERR_NAME_NOT_RESOLVED',
      retrying: true
    })
    expect(idle.buttons).toEqual([{ action: 'retry', label: 'Try again', disabled: false }])
    expect(busy.buttons).toEqual([{ action: 'retry', label: 'Trying again…', disabled: true }])
    expect(busy.waiting).toBe(true)
    // The code travels as the detail line, for bug reports.
    expect(idle.detail).toBe('ERR_NAME_NOT_RESOLVED')
  })

  it('makes Wait the default for a hang, since it is the choice that loses nothing', () => {
    const message = describePageStatus({ kind: 'unresponsive' })
    expect(message.buttons.map((b) => b.action)).toEqual(['wait', 'reload'])
  })

  it('names the cause of a crash when Electron gives one', () => {
    expect(describePageStatus({ kind: 'crashed', reason: 'oom' }).body).toMatch(/memory/)
    expect(describePageStatus({ kind: 'crashed', reason: 'crashed' }).body).toBe(
      'Reloading usually brings it back.'
    )
  })
})

describe('describeLoadFailure', () => {
  it('retries by itself only where retrying can help', () => {
    // Network trouble fixes itself; a certificate or a firewall rule does not.
    for (const code of [-106, -105, -137, -7, -118, -130, -21, -100, -101, -102, -324]) {
      expect(describeLoadFailure(code).autoRetry, String(code)).toBe(true)
    }
    for (const code of [-200, -202, -299, -107, -113, -501, -22, -138, -2, -999]) {
      expect(describeLoadFailure(code).autoRetry, String(code)).toBe(false)
    }
  })

  it('tells offline apart from the network failing to find SoundCloud', () => {
    expect(describeLoadFailure(-106).title).toBe('You’re offline')
    expect(describeLoadFailure(-105).title).toBe('Can’t find soundcloud.com')
  })

  it('only promises to keep trying where it does keep trying', () => {
    for (const code of [-106, -105, -7, -130, -102, -200, -22, -2]) {
      const { body, autoRetry } = describeLoadFailure(code)
      const promises = /keeps trying|as soon as you’re back online/.test(body)
      expect(promises, String(code)).toBe(autoRetry)
    }
  })
})

describe('retryDelay', () => {
  it('follows Chrome’s error-page schedule and stops growing at half an hour', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(retryDelay)).toEqual([
      1_000, 5_000, 30_000, 60_000, 300_000, 600_000, 1_800_000
    ])
    expect(retryDelay(50)).toBe(1_800_000)
    expect(retryDelay(-1)).toBe(1_000)
  })
})

describe('hidesPage', () => {
  it('floats over the page only for a hang, where the page is still there', () => {
    for (const status of EVERY_STATUS) {
      expect(hidesPage(status), status.kind).toBe(status.kind !== 'unresponsive')
    }
  })
})

describe('isPageStatusAction', () => {
  it('accepts the verbs and nothing else', () => {
    for (const action of PAGE_STATUS_ACTIONS) expect(isPageStatusAction(action)).toBe(true)
    for (const value of ['', 'Retry', 'eval', null, undefined, 1, {}]) {
      expect(isPageStatusAction(value)).toBe(false)
    }
  })
})

describe('describeComponentsError', () => {
  it('reads the per-component messages out of a ComponentsError, as measured offline', () => {
    const error = Object.assign(new Error('Failed to install required components'), {
      errors: [
        { message: 'Update check error', detail: { id: 'oimompecagnajdejgnnjijobebaeigek' } }
      ]
    })
    expect(describeComponentsError(error)).toBe('Update check error')
  })

  it('falls back to the message, and copes with rejections that are not errors at all', () => {
    expect(describeComponentsError(new Error('boom'))).toBe('boom')
    expect(describeComponentsError('plain string')).toBe('plain string')
    expect(describeComponentsError(undefined)).toBe('undefined')
    expect(describeComponentsError({ errors: [{}, { message: 'a' }, { message: 'a' }] })).toBe(
      'a'
    )
  })
})
