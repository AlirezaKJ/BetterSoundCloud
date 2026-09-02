import { describe, it, expect } from 'vitest'
import {
  SETTINGS,
  SETTING_KEYS,
  SECTIONS,
  coerce,
  coerceAll,
  defaults,
  isSettingKey
} from './settings-schema'

describe('schema integrity', () => {
  it('gives every setting a label and a known section', () => {
    for (const key of SETTING_KEYS) {
      const def = SETTINGS[key]
      expect(def.label, key).toBeTruthy()
      expect(SECTIONS, key).toContain(def.section)
    }
  })

  it('keeps every numeric default inside its own bounds', () => {
    for (const key of SETTING_KEYS) {
      const def = SETTINGS[key]
      if (def.kind !== 'number') continue
      expect(def.min, key).toBeLessThan(def.max)
      expect(def.default, key).toBeGreaterThanOrEqual(def.min)
      expect(def.default, key).toBeLessThanOrEqual(def.max)
    }
  })

  it('keeps every enum default inside its own options', () => {
    for (const key of SETTING_KEYS) {
      const def = SETTINGS[key]
      if (def.kind !== 'enum') continue
      expect(def.options, key).toContain(def.default)
    }
  })

  // The value is assigned straight to Electron's `nativeTheme.themeSource`, which accepts
  // exactly these three strings. Adding a fourth option here would typecheck and then fail
  // at runtime, so pin it.
  it('keeps colorScheme options in sync with nativeTheme.themeSource', () => {
    const def = SETTINGS['appearance.colorScheme']
    expect(def.kind).toBe('enum')
    expect([...def.options]).toEqual(['system', 'light', 'dark'])
    expect(def.default).toBe('system')
  })

  it('marks every setting nothing reads yet as not wired', () => {
    // Keep this list in step with what main actually reads. Clearing a `wired: false`
    // without wiring the setting is the failure this guards against.
    const wired = SETTING_KEYS.filter((k) => !('wired' in SETTINGS[k]))
    expect(wired.sort()).toEqual([
      'advanced.hardwareAcceleration',
      'appearance.colorScheme',
      'appearance.fullWidthLayout',
      'appearance.hideMenuBar',
      'appearance.zoomFactor'
    ])
  })

  it('ships the ad blocker off by default', () => {
    // Deliberate: in v0.7.x enablement was nondeterministic and it is a live suspect
    // in the sign-in blocks. Changing this needs a decision, not a drive-by edit.
    expect(SETTINGS['advanced.adBlocker'].default).toBe(false)
  })
})

describe('coerce', () => {
  it('clamps numbers into range instead of rejecting them', () => {
    expect(coerce('appearance.zoomFactor', 9999)).toBe(500)
    expect(coerce('appearance.zoomFactor', -40)).toBe(10)
    expect(coerce('appearance.zoomFactor', 125)).toBe(125)
  })

  it('falls back to the default for the wrong type', () => {
    expect(coerce('appearance.zoomFactor', 'big')).toBe(100)
    expect(coerce('general.minimizeToTray', 'true')).toBe(false)
    expect(coerce('general.checkForUpdates', null)).toBe(true)
  })

  it('rejects NaN and Infinity', () => {
    expect(coerce('appearance.zoomFactor', Number.NaN)).toBe(100)
    expect(coerce('appearance.zoomFactor', Number.POSITIVE_INFINITY)).toBe(100)
  })

  it('accepts only listed enum members', () => {
    expect(coerce('general.startupUrl', 'library')).toBe('library')
    expect(coerce('general.startupUrl', 'somewhere-else')).toBe('discover')
  })

  // v0.7.x's LSDB.js coerced every stored value by regex, so an all-digits string
  // setting came back as a number. Strings stay strings here.
  it('does not coerce a numeric-looking string setting to a number', () => {
    expect(coerce('appearance.theme', '2024')).toBe('2024')
  })
})

describe('coerceAll', () => {
  it('fills in every missing key from defaults', () => {
    expect(coerceAll({})).toEqual(defaults())
  })

  it('drops unknown keys rather than passing them through', () => {
    const result = coerceAll({ 'not.a.setting': true, 'general.minimizeToTray': true })
    expect(result).not.toHaveProperty('not.a.setting')
    expect(result['general.minimizeToTray']).toBe(true)
  })

  it('repairs a hand-edited config with poisoned values', () => {
    const result = coerceAll({
      'appearance.zoomFactor': { evil: true },
      'general.startupUrl': 42
    })
    expect(result['appearance.zoomFactor']).toBe(100)
    expect(result['general.startupUrl']).toBe('discover')
  })
})

describe('isSettingKey', () => {
  it('accepts known keys and rejects everything else', () => {
    expect(isSettingKey('general.minimizeToTray')).toBe(true)
    expect(isSettingKey('constructor')).toBe(false)
    expect(isSettingKey('__proto__')).toBe(false)
    expect(isSettingKey(7)).toBe(false)
  })
})
