import { describe, it, expect } from 'vitest'
import { isDataDomeChallenge, whoAnswered } from './diagnostics'

describe('whoAnswered', () => {
  it('names SoundCloud for its own servers', () => {
    // Measured: a plain request to api-v2 without credentials, answered with a 401.
    expect(
      whoAnswered({
        'x-robots-tag': ['noindex'],
        Server: ['am/2'],
        'X-Cache': ['Error from cloudfront']
      })
    ).toEqual({ by: 'soundcloud', evidence: 'server am/2' })
  })

  it('names DataDome for any of its own headers, whatever the server says', () => {
    // Its decision can come back through SoundCloud's servers, so am/2 must not win.
    expect(whoAnswered({ server: ['am/2'], 'X-DataDome': ['protected'] })).toEqual({
      by: 'datadome',
      evidence: 'x-datadome: protected'
    })
    expect(whoAnswered({ 'x-dd-b': ['1'] }).by).toBe('datadome')
    expect(whoAnswered({ 'X-DataDome-CID': ['abc'] }).by).toBe('datadome')
  })

  it('names DataDome when the refusal sets its cookie', () => {
    expect(
      whoAnswered({
        server: ['am/2'],
        'set-cookie': [
          'other=1; Path=/',
          'datadome=abc123; Max-Age=31536000; Domain=.soundcloud.com'
        ]
      })
    ).toEqual({ by: 'datadome', evidence: 'sets the datadome cookie' })
  })

  it('is not fooled by a cookie that merely contains the name', () => {
    expect(whoAnswered({ server: ['am/2'], 'set-cookie': ['notdatadome=1'] }).by).toBe(
      'soundcloud'
    )
  })

  it('names DataDome when its own server answered', () => {
    // Measured: DataDome's collector under dwt.soundcloud.com answers as `DataDome`.
    expect(whoAnswered({ Server: ['DataDome'] }).by).toBe('datadome')
  })

  it('names CloudFront for an error from the CDN itself', () => {
    expect(whoAnswered({ server: ['CloudFront'] }).by).toBe('cloudfront')
  })

  it('admits when it cannot tell', () => {
    expect(whoAnswered({})).toEqual({ by: 'unknown', evidence: 'no server header' })
    expect(whoAnswered(undefined).by).toBe('unknown')
    expect(whoAnswered({ server: ['nginx'] })).toEqual({
      by: 'unknown',
      evidence: 'server nginx'
    })
  })
})

describe('isDataDomeChallenge', () => {
  it('spots DataDome’s captcha host', () => {
    expect(isDataDomeChallenge('https://geo.captcha-delivery.com/captcha/?initialCid=x')).toBe(
      true
    )
    expect(isDataDomeChallenge('https://captcha-delivery.com/')).toBe(true)
  })

  it('ignores everything else', () => {
    expect(isDataDomeChallenge('https://api-v2.soundcloud.com/me')).toBe(false)
    expect(isDataDomeChallenge('https://notcaptcha-delivery.com/')).toBe(false)
    expect(isDataDomeChallenge('not a url')).toBe(false)
  })
})
