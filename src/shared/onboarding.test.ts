import { describe, expect, it } from 'vitest'
import { needsOnboarding, readOnboardingRecord } from './onboarding'

describe('readOnboardingRecord', () => {
  it('reads a record', () => {
    expect(readOnboardingRecord({ finished: true })).toEqual({ finished: true })
    expect(readOnboardingRecord({ finished: false })).toEqual({ finished: false })
  })

  it('refuses anything else', () => {
    expect(readOnboardingRecord(null)).toBeNull()
    expect(readOnboardingRecord({})).toBeNull()
    expect(readOnboardingRecord({ finished: 'yes' })).toBeNull()
    expect(readOnboardingRecord([true])).toBeNull()
  })
})

describe('needsOnboarding', () => {
  it('shows on a new profile', () => {
    expect(needsOnboarding(null, true)).toBe(true)
  })

  it('never shows unasked to a profile that already had settings', () => {
    // Someone who set up 0.8.0 before the welcome existed.
    expect(needsOnboarding(null, false)).toBe(false)
  })

  it('comes back after being left half way, and not once finished', () => {
    expect(needsOnboarding({ finished: false }, false)).toBe(true)
    expect(needsOnboarding({ finished: true }, false)).toBe(false)
    expect(needsOnboarding({ finished: true }, true)).toBe(false)
  })
})
