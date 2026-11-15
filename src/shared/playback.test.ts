import { describe, it, expect } from 'vitest'
import { mprisNameFor, nextVolume, ourSinkInputs, readDbusNames } from './playback'

describe('our media session on D-Bus', () => {
  // What `dbus-send --print-reply … ListNames` prints, abridged.
  const reply = `method return time=1700000000.1 sender=org.freedesktop.DBus -> destination=:1.9 serial=3 reply_serial=2
   array [
      string "org.freedesktop.DBus"
      string ":1.7"
      string "org.mpris.MediaPlayer2.spotify"
      string "org.mpris.MediaPlayer2.chromium.instance4100"
      string "org.mpris.MediaPlayer2.chromium.instance5200"
   ]`

  it('reads the names, and picks the player our main process registered, no other', () => {
    const names = readDbusNames(reply)
    expect(names).toContain('org.mpris.MediaPlayer2.spotify')
    expect(mprisNameFor(names, 5200)).toBe('org.mpris.MediaPlayer2.chromium.instance5200')
    // Another copy of Chromium or Electron playing is never ours.
    expect(mprisNameFor(names, 520)).toBeNull()
    expect(mprisNameFor(names, 9999)).toBeNull()
  })
})

describe('our streams in the sound server', () => {
  // `pactl -f json list sink-inputs`, abridged to what is read.
  const json = [
    {
      index: 41,
      mute: false,
      volume: {
        'front-left': { value: 52429, value_percent: '80%', db: '-5.81 dB' },
        'front-right': { value: 45875, value_percent: '70%', db: '-9.29 dB' }
      },
      properties: { 'application.process.id': '5210', 'application.name': 'Chromium' }
    },
    {
      index: 42,
      mute: true,
      volume: { mono: { value_percent: '100%' } },
      properties: { 'application.process.id': '777', 'application.name': 'Firefox' }
    },
    'not a stream',
    { index: 'x', properties: { 'application.process.id': '5210' } }
  ]

  it('keeps only the streams of our processes, at their loudest channel', () => {
    expect(ourSinkInputs(json, [5200, 5210])).toEqual([{ index: 41, level: 0.8, muted: false }])
    expect(ourSinkInputs(json, [1])).toEqual([])
    expect(ourSinkInputs({ not: 'a list' }, [5210])).toEqual([])
  })
})

describe('the next volume', () => {
  it('moves by a step on the step’s grid, never past 100% or below silence', () => {
    expect(nextVolume({ level: 0.8, muted: false }, 'up', 0.05)).toEqual({
      level: 0.85,
      muted: false
    })
    expect(nextVolume({ level: 0.33, muted: false }, 'up', 0.05)).toEqual({
      level: 0.4,
      muted: false
    })
    expect(nextVolume({ level: 0.98, muted: false }, 'up', 0.05)).toEqual({
      level: 1,
      muted: false
    })
    expect(nextVolume({ level: 0.02, muted: false }, 'down', 0.05)).toEqual({
      level: 0,
      muted: false
    })
  })

  it('unmutes when turned up, as the system’s keys do, and mute toggles', () => {
    expect(nextVolume({ level: 0.5, muted: true }, 'up', 0.05)).toEqual({
      level: 0.55,
      muted: false
    })
    expect(nextVolume({ level: 0.5, muted: true }, 'down', 0.05)).toEqual({
      level: 0.45,
      muted: true
    })
    expect(nextVolume({ level: 0.5, muted: false }, 'mute', 0.05)).toEqual({
      level: 0.5,
      muted: true
    })
  })
})
