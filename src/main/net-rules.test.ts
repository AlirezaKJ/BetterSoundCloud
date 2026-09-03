import { describe, it, expect } from 'vitest'
import { neverFilter, isAudioAdRequest } from './net-rules'

describe('neverFilter', () => {
  // Each of these has a specific failure it prevents, so they are listed individually
  // rather than looped — a failing test should name the thing that would break.
  it('protects the sign-in path', () => {
    expect(neverFilter('https://secure.soundcloud.com/sign-in')).toBe(true)
    expect(neverFilter('https://api-auth.soundcloud.com/oauth/authorize')).toBe(true)
  })

  it('protects DataDome, which SoundCloud serves first-party', () => {
    // Blocking this is the scenario the whole design exists to make impossible.
    expect(neverFilter('https://dwt.soundcloud.com/tags.js')).toBe(true)
    expect(neverFilter('https://geo.captcha-delivery.com/captcha/')).toBe(true)
    expect(neverFilter('https://api-js.datadome.co/js/')).toBe(true)
  })

  it('protects reCAPTCHA and third-party sign-in', () => {
    expect(neverFilter('https://www.google.com/recaptcha/api.js')).toBe(true)
    expect(neverFilter('https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js')).toBe(
      true
    )
    expect(neverFilter('https://accounts.google.com/o/oauth2/auth')).toBe(true)
    expect(neverFilter('https://connect.facebook.net/en_US/sdk.js')).toBe(true)
  })

  it('protects playback — audio, artwork and the API', () => {
    expect(neverFilter('https://a-v2.sndcdn.com/media/soundcloud/123/stream/hls')).toBe(true)
    expect(neverFilter('https://cf-hls-media.sndcdn.com/media/123/playlist.m3u8')).toBe(true)
    expect(neverFilter('https://i1.sndcdn.com/artworks-abc-large.jpg')).toBe(true)
    expect(neverFilter('https://api-v2.soundcloud.com/me/play-history/tracks')).toBe(true)
  })

  it('protects anything licence-shaped, since the DRM host is not measured yet', () => {
    expect(neverFilter('https://example.com/widevine/license')).toBe(true)
    expect(neverFilter('https://cdn.example.net/drm/acquire')).toBe(true)
  })

  it('does NOT protect third-party ad and tracking hosts', () => {
    expect(neverFilter('https://securepubads.g.doubleclick.net/tag/js/gpt.js')).toBe(false)
    expect(neverFilter('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')).toBe(
      false
    )
    expect(neverFilter('https://raven-edge.aditude.io/x.js')).toBe(false)
    expect(neverFilter('https://analytics.tiktok.com/i18n/pixel/events.js')).toBe(false)
    expect(neverFilter('https://c.amazon-adsystem.com/aax2/apstag.js')).toBe(false)
  })

  it('is not fooled by a lookalike domain', () => {
    expect(neverFilter('https://notsoundcloud.com/')).toBe(false)
    expect(neverFilter('https://soundcloud.com.evil.example/')).toBe(false)
    expect(neverFilter('https://evilgoogle.com/')).toBe(false)
  })

  // The regression these exist for: the first version of this allowlist protected every
  // SoundCloud host, which cancelled the filter lists' own rule for SoundCloud's audio-ad
  // endpoint and switched the playback ads back on. v0.7.x had no allowlist and stayed quiet.
  it('does NOT protect SoundCloud’s audio-ad endpoint', () => {
    expect(neverFilter('https://api-v2.soundcloud.com/audio-ads')).toBe(false)
    expect(neverFilter('https://api-v2.soundcloud.com/audio-ads?client_id=x')).toBe(false)
    expect(neverFilter('https://api-v2.soundcloud.com/audio-ads/')).toBe(false)
    expect(neverFilter('https://soundcloud.com/audio-ads')).toBe(false)
  })

  it('keeps the audio-ad exception exactly as narrow as the list rule', () => {
    // These merely contain the words and must stay protected, or a future SoundCloud API
    // route named after ads would take playback down with it.
    expect(neverFilter('https://api-v2.soundcloud.com/v2/audio-ads')).toBe(true)
    expect(neverFilter('https://api-v2.soundcloud.com/tracks/1/audio-ads')).toBe(true)
    expect(neverFilter('https://api-v2.soundcloud.com/me/audio-adsxyz')).toBe(true)
  })

  it('does NOT protect Google’s IMA ad SDK, but protects the rest of googleapis.com', () => {
    expect(neverFilter('https://imasdk.googleapis.com/js/sdkloader/ima3.js')).toBe(false)
    expect(neverFilter('https://fonts.googleapis.com/css2?family=X')).toBe(true)
    expect(neverFilter('https://www.googleapis.com/oauth2/v3/certs')).toBe(true)
  })

  it('lets through anything it cannot parse rather than blocking it', () => {
    expect(neverFilter('not a url')).toBe(true)
    expect(neverFilter('')).toBe(true)
  })
})

describe('isAudioAdRequest', () => {
  it('matches the endpoint the player calls when an ad is due', () => {
    // Captured live, with its real query string.
    expect(
      isAudioAdRequest(
        'https://api-v2.soundcloud.com/audio-ads?sc_a_id=abc&track_id=1108580416&aw_listener_id=xyz'
      )
    ).toBe(true)
    expect(isAudioAdRequest('https://api-v2.soundcloud.com/audio-ads')).toBe(true)
    expect(isAudioAdRequest('https://api-v2.soundcloud.com/audio-ads/')).toBe(true)
    expect(isAudioAdRequest('https://soundcloud.com/audio-ads')).toBe(true)
  })

  it('matches AdsWizz, the audio-ad network, and the IMA ad SDK', () => {
    expect(isAudioAdRequest('https://synchrobox.adswizz.com/register2.php')).toBe(true)
    expect(isAudioAdRequest('https://cdn.adswizz.com/adswizz/js/SynchroClient2.js')).toBe(true)
    expect(isAudioAdRequest('https://synchroscript.deliveryengine.adswizz.com/x')).toBe(true)
    expect(isAudioAdRequest('https://imasdk.googleapis.com/js/sdkloader/ima3.js')).toBe(true)
  })

  it('does not match anything playback or sign-in depends on', () => {
    // If any of these ever matched, switching audio-ad blocking on would break the app.
    expect(isAudioAdRequest('https://api-v2.soundcloud.com/me')).toBe(false)
    expect(isAudioAdRequest('https://api-v2.soundcloud.com/tracks/1/audio-ads')).toBe(false)
    expect(isAudioAdRequest('https://api-v2.soundcloud.com/v2/audio-ads')).toBe(false)
    expect(isAudioAdRequest('https://a-v2.sndcdn.com/media/123/stream/hls')).toBe(false)
    expect(isAudioAdRequest('https://secure.soundcloud.com/sign-in')).toBe(false)
    expect(isAudioAdRequest('https://dwt.soundcloud.com/tags.js')).toBe(false)
    expect(isAudioAdRequest('https://www.googleapis.com/oauth2/v3/certs')).toBe(false)
    expect(isAudioAdRequest('https://notadswizz.com/x')).toBe(false)
  })

  it('is not fooled by a lookalike host', () => {
    expect(isAudioAdRequest('https://adswizz.com.evil.example/x')).toBe(false)
    expect(isAudioAdRequest('https://soundcloud.com.evil.example/audio-ads')).toBe(false)
  })

  it('says no to anything it cannot parse', () => {
    expect(isAudioAdRequest('not a url')).toBe(false)
    expect(isAudioAdRequest('')).toBe(false)
  })
})
