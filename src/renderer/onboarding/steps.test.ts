import { describe, expect, it } from 'vitest'
import { defaults } from '@shared/settings-schema'
import { isChosen, STEPS, stepsFor } from './steps'
import type { Choice } from './steps'

const DEFAULTS = defaults()

const ids = (platform: string, updates: 'install' | 'tell' | 'none'): string[] =>
  stepsFor(platform, updates).map((step) => step.id)

describe('stepsFor', () => {
  it('starts with the welcome and ends on sign-in, everywhere', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      const steps = ids(platform, 'install')
      expect(steps[0]).toBe('welcome')
      expect(steps.at(-1)).toBe('sign-in')
    }
  })

  it('asks about Glass only on Windows, and the tray only where closing can keep playing', () => {
    expect(ids('win32', 'install')).toEqual(expect.arrayContaining(['glass', 'close']))
    expect(ids('linux', 'install')).toContain('close')
    expect(ids('linux', 'install')).not.toContain('glass')
    expect(ids('darwin', 'install')).not.toContain('glass')
    expect(ids('darwin', 'install')).not.toContain('close')
  })

  it('says what this copy does about updates, and leaves the question out where it can do nothing', () => {
    const lead = (updates: 'install' | 'tell'): string =>
      stepsFor('win32', updates).find((step) => step.id === 'updates')?.lead ?? ''
    expect(lead('install')).toContain('installs them when you quit')
    expect(lead('tell')).toContain('can’t replace itself')
    expect(ids('win32', 'none')).not.toContain('updates')
  })
})

describe('the answers', () => {
  const choices = STEPS.flatMap((step) => (step.kind === 'choice' ? step.choices : []))

  it('write only settings that exist', () => {
    for (const choice of choices) {
      for (const key of Object.keys(choice.set)) expect(key in DEFAULTS).toBe(true)
    }
  })

  it('open each question on the default: exactly one answer matches a new profile', () => {
    for (const step of STEPS) {
      if (step.kind !== 'choice') continue
      const chosen = step.choices.filter((choice) => isChosen(choice, DEFAULTS))
      expect(
        chosen.map((c) => c.id),
        step.id
      ).toHaveLength(1)
    }
  })

  it('match only when every setting they write has that value', () => {
    const both: Choice = {
      id: 'x',
      label: '',
      detail: '',
      set: { 'advanced.blockAudioAds': true, 'advanced.adBlocker': true }
    }
    expect(isChosen(both, DEFAULTS)).toBe(false)
    expect(isChosen(both, { ...DEFAULTS, 'advanced.adBlocker': true })).toBe(true)
  })
})
