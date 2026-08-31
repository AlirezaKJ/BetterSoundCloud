import { describe, it, expect, vi } from 'vitest'

// `session.ts` imports `shell` from electron, which does not exist in a plain node
// test process. Stub the module; nothing under test here touches it.
vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const { isPermissionAllowed, isInternalUrl } = await import('./session')

describe('isPermissionAllowed', () => {
  // The regression this guards is subtle and expensive: denying mediaKeySystem breaks
  // DRM playback in a way that looks exactly like an unsigned VMP build.
  it('allows mediaKeySystem, because that is Widevine', () => {
    expect(isPermissionAllowed('mediaKeySystem')).toBe(true)
  })

  it('denies everything not explicitly allowed', () => {
    for (const p of [
      'geolocation',
      'notifications',
      'midiSysex',
      'display-capture',
      'idle-detection',
      'openExternal',
      'media'
    ]) {
      expect(isPermissionAllowed(p), p).toBe(false)
    }
  })
})

describe('isInternalUrl', () => {
  it('accepts SoundCloud and its subdomains', () => {
    expect(isInternalUrl('https://soundcloud.com/discover')).toBe(true)
    expect(isInternalUrl('https://secure.soundcloud.com/sign-in')).toBe(true)
    expect(isInternalUrl('https://a-v2.sndcdn.com/media/x')).toBe(true)
  })

  it('rejects third-party origins so they open in the real browser', () => {
    expect(isInternalUrl('https://accounts.google.com/o/oauth2/auth')).toBe(false)
    expect(isInternalUrl('https://facebook.com/login')).toBe(false)
  })

  it('is not fooled by a suffix match on the registrable domain', () => {
    expect(isInternalUrl('https://notsoundcloud.com/')).toBe(false)
    expect(isInternalUrl('https://soundcloud.com.evil.example/')).toBe(false)
  })

  it('rejects non-http schemes and unparseable input', () => {
    expect(isInternalUrl('file:///etc/passwd')).toBe(false)
    expect(isInternalUrl('javascript:alert(1)')).toBe(false)
    expect(isInternalUrl('not a url')).toBe(false)
  })
})
