import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'
import { importSoundCloudCookies } from './cookie-import'

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }))

import { readFile } from 'node:fs/promises'

describe('SoundCloud cookie import', () => {
  const set = vi.fn().mockResolvedValue(undefined)
  const sess = { cookies: { set } } as unknown as Session

  beforeEach(() => {
    set.mockClear()
  })

  it('imports SoundCloud cookies without copying other sites', async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify([
        { domain: '.soundcloud.com', name: 'session', value: 'secret', path: '/' },
        { domain: '.google.com', name: 'google', value: 'secret' },
        { domain: 'evilsoundcloud.com', name: 'evil', value: 'secret' }
      ])
    )

    expect(await importSoundCloudCookies(sess, 'export.json')).toBe(1)
    expect(set).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ domain: '.soundcloud.com', name: 'session', value: 'secret' })
    )
  })
})
