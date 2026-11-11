import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'
import { NOT_AN_EXPORT, NO_SIGN_IN } from '@shared/sign-in-cookies'

const files = vi.hoisted(() => ({ text: '', size: 0 }))
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve(files.text)),
  stat: vi.fn(() => Promise.resolve({ size: files.size }))
}))

import { ImportProblem, importSignIn } from './cookie-import'

/** Every call to the session's cookie store, in order. */
const calls: string[] = []
const session = {
  cookies: {
    remove: vi.fn((url: string, name: string) => {
      calls.push(`remove ${name} ${url}`)
      return Promise.resolve()
    }),
    set: vi.fn((details: { name: string; url: string }) => {
      calls.push(`set ${details.name} ${details.url}`)
      return Promise.resolve()
    })
  }
} as unknown as Session

function exportOf(entries: unknown[]): void {
  files.text = JSON.stringify(entries)
  files.size = files.text.length
}

const NOW = 1_800_000_000
const token = { domain: 'soundcloud.com', name: 'oauth_token', value: 'abc', path: '/' }

beforeEach(() => {
  calls.length = 0
})

describe('importing a browser’s sign-in', () => {
  it('clears the app’s old sign-in, every part of it, then sets only the new one', async () => {
    exportOf([
      token,
      { domain: '.soundcloud.com', name: 'datadome', value: 'bot-check' },
      { domain: '.google.com', name: 'SID', value: 'google' }
    ])
    expect(await importSignIn(session, 'export.json', NOW)).toEqual({ imported: 1, ignored: 2 })
    expect(calls).toEqual([
      'remove oauth_token https://soundcloud.com/',
      'remove oauth_refresh_token https://soundcloud.com/',
      'remove _soundcloud_session https://api-auth.soundcloud.com/',
      'set oauth_token https://soundcloud.com/'
    ])
  })

  it('changes nothing when the file has no sign-in in it', async () => {
    exportOf([{ domain: '.soundcloud.com', name: '_ga', value: 'x' }])
    await expect(importSignIn(session, 'export.json', NOW)).rejects.toThrow(NO_SIGN_IN)
    expect(calls).toEqual([])
  })

  it('says a file that is not JSON, or far too big, is not an export', async () => {
    files.text = 'not json'
    files.size = files.text.length
    await expect(importSignIn(session, 'notes.txt', NOW)).rejects.toThrow(NOT_AN_EXPORT)

    exportOf([token])
    files.size = 5_000_000
    const failure = importSignIn(session, 'huge.json', NOW)
    await expect(failure).rejects.toBeInstanceOf(ImportProblem)
    expect(calls).toEqual([])
  })
})
