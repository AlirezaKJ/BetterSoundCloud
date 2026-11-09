import { describe, it, expect, vi } from 'vitest'

// `session.ts` imports `shell` from electron, which does not exist in a plain node
// test process. Stub the module; nothing under test here touches it.
vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const { expectTabAudioCapture, isPermissionAllowed, isInternalUrl, mayCaptureAudio } =
  await import('./session')

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

describe('mayCaptureAudio', () => {
  // Electron names the view being captured — SoundCloud's — with our renderer's origin (measured).
  const soundcloud = { id: 1 } as Electron.WebContents
  const other = { id: 7 } as Electron.WebContents
  const ours = { mediaTypes: [], securityOrigin: 'file:///' }

  it('grants nothing until main is about to capture', () => {
    expect(mayCaptureAudio(soundcloud, 'media', ours, 0)).toBe(false)
    expect(isPermissionAllowed('media')).toBe(false)
  })

  it('grants the one capture main armed, once, while its id lives', () => {
    expectTabAudioCapture(soundcloud, 0)
    expect(mayCaptureAudio(soundcloud, 'media', ours, 1_000)).toBe(true)
    // Used up: a second request gets nothing.
    expect(mayCaptureAudio(soundcloud, 'media', ours, 1_001)).toBe(false)
    // An id lives ten seconds; so does the grant.
    expectTabAudioCapture(soundcloud, 0)
    expect(mayCaptureAudio(soundcloud, 'media', ours, 10_001)).toBe(false)
  })

  it('refuses anything else while armed: another view, a device, SoundCloud’s own origin', () => {
    expectTabAudioCapture(soundcloud, 0)
    expect(mayCaptureAudio(other, 'media', ours, 1)).toBe(false)
    expect(mayCaptureAudio(soundcloud, 'display-capture', ours, 1)).toBe(false)
    expect(mayCaptureAudio(soundcloud, 'media', { ...ours, mediaTypes: ['audio'] }, 1)).toBe(
      false
    )
    expect(
      mayCaptureAudio(
        soundcloud,
        'media',
        { ...ours, securityOrigin: 'https://soundcloud.com/' },
        1
      )
    ).toBe(false)
    expect(mayCaptureAudio(soundcloud, 'media', { mediaTypes: [] }, 1)).toBe(false)
    expect(mayCaptureAudio(null, 'media', ours, 1)).toBe(false)
    // Still armed for the real request after all of those.
    expect(
      mayCaptureAudio(
        soundcloud,
        'media',
        { ...ours, securityOrigin: 'http://localhost:5173/' },
        2
      )
    ).toBe(true)
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
