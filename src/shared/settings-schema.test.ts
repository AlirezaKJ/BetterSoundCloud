import { describe, it, expect } from 'vitest'
import {
  SETTINGS,
  SETTING_KEYS,
  SECTIONS,
  coerce,
  coerceAll,
  defaults,
  isSettingKey,
  upgradeValues,
  APPLIES_NOTES
} from './settings-schema'
import { parseKeys, refusal, sameKeys } from './shortcuts'
import type { SettingDef, SettingKey } from './settings-schema'

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
      'advanced.adBlocker',
      'advanced.blockAudioAds',
      'advanced.hardwareAcceleration',
      'appearance.autoHideHeader',
      'appearance.background',
      'appearance.backgroundBlur',
      'appearance.backgroundStrength',
      'appearance.colorScheme',
      'appearance.fullWidthLayout',
      'appearance.glass',
      'appearance.glassTint',
      'appearance.hideMenuBar',
      'appearance.minimalNavigation',
      'appearance.playerButtons',
      'appearance.theme',
      'appearance.zoomFactor',
      'discord.enabled',
      'discord.showWhenPaused',
      'general.checkForUpdates',
      'general.minimizeToTray',
      'general.startupUrl',
      'shortcuts.back',
      'shortcuts.focusNext',
      'shortcuts.focusPrevious',
      'shortcuts.forward',
      'shortcuts.mute',
      'shortcuts.mute.anywhere',
      'shortcuts.nextTrack',
      'shortcuts.nextTrack.anywhere',
      'shortcuts.openSettings',
      'shortcuts.playPause',
      'shortcuts.playPause.anywhere',
      'shortcuts.previousTrack',
      'shortcuts.previousTrack.anywhere',
      'shortcuts.reload',
      'shortcuts.searchSettings',
      'shortcuts.volumeDown',
      'shortcuts.volumeDown.anywhere',
      'shortcuts.volumeUp',
      'shortcuts.volumeUp.anywhere',
      'shortcuts.zoomIn',
      'shortcuts.zoomOut',
      'shortcuts.zoomReset'
    ])
  })

  it('names every option of a dropdown the panel draws', () => {
    // The panel falls back to the raw value, so a missing label shows "lastVisited" in a menu.
    for (const key of SETTING_KEYS) {
      const def: SettingDef = SETTINGS[key]
      if (def.kind !== 'enum' || def.drawnBy) continue
      for (const option of def.options) {
        expect(def.labels?.[option], `${key}: ${option}`).toBeTruthy()
      }
    }
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

describe('applies', () => {
  const entries = SETTING_KEYS.map((k) => [k, SETTINGS[k]] as const)

  it('marks the two settings whose effect is not immediate, and no others', () => {
    const withApplies = entries
      .filter(([, def]) => 'applies' in def && def.applies)
      .map(([key, def]) => `${key}:${(def as { applies: string }).applies}`)
      .sort()

    // Everything else applies live — the main process reads it per request, or re-injects
    // CSS into the open document. Pinned so that adding a setting that needs a reload or a
    // restart forces a deliberate decision here rather than a silent lie in the panel.
    expect(withApplies).toEqual([
      'advanced.adBlocker:reload',
      'advanced.hardwareAcceleration:restart'
    ])
  })

  it('never states timing as hand-typed help prose', () => {
    // `advanced.hardwareAcceleration` used to carry "Requires a restart." as its ENTIRE help
    // string, so the setting was never actually explained and nothing could test the claim.
    const offenders = entries
      .filter(([, def]) => 'help' in def && /restart|reload|relaunch/i.test(def.help ?? ''))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it('has copy for every applies value it can take', () => {
    for (const [, def] of entries) {
      if ('applies' in def && def.applies) {
        expect(APPLIES_NOTES[def.applies]).toBeTruthy()
      }
    }
  })
})

describe('upgradeValues', () => {
  it('moves Minimal navigation from the theme list onto its own switch', () => {
    // It was a theme until settings version 2. The page must look exactly as it did.
    expect(
      upgradeValues(1, { 'appearance.theme': 'minimal-nav', 'appearance.zoomFactor': 90 })
    ).toEqual({
      'appearance.theme': 'vanilla',
      'appearance.minimalNavigation': true,
      'appearance.zoomFactor': 90
    })
  })

  it('leaves every other theme, and already-upgraded settings, alone', () => {
    expect(upgradeValues(1, { 'appearance.theme': 'darkcloud' })).toEqual({
      'appearance.theme': 'darkcloud'
    })
    expect(upgradeValues(2, { 'appearance.theme': 'minimal-nav' })).toEqual({
      'appearance.theme': 'minimal-nav'
    })
  })
})

describe('drawnBy', () => {
  it('is only used where something draws it: Themes for its components, Shortcuts for the keys', () => {
    // Settings.svelte skips these rows everywhere, but only the Themes section renders the
    // components that draw them, and only a shortcut's row its "Also in other apps" switch — a
    // `drawnBy` setting anywhere else would simply vanish.
    for (const key of SETTING_KEYS) {
      const def: SettingDef = SETTINGS[key]
      if (def.drawnBy === 'keys') expect(def.section, key).toBe('shortcuts')
      else if (def.drawnBy) expect(def.section, key).toBe('themes')
    }
  })

  it('draws each "Also in other apps" switch in exactly one shortcut’s row', () => {
    const anywhere = SETTING_KEYS.flatMap((key) => {
      const def: SettingDef = SETTINGS[key]
      return def.kind === 'keys' && def.anywhere ? [def.anywhere] : []
    })
    const drawnByKeys = SETTING_KEYS.filter((key) => {
      const def: SettingDef = SETTINGS[key]
      return def.drawnBy === 'keys'
    })
    expect([...anywhere].sort()).toEqual([...drawnByKeys].sort())
    for (const key of anywhere) {
      expect(isSettingKey(key), key).toBe(true)
      expect(SETTINGS[key as SettingKey].kind, key).toBe('boolean')
    }
  })
})

describe('shortcuts', () => {
  const keySettings = SETTING_KEYS.filter((key) => SETTINGS[key].kind === 'keys')

  it('writes every default in its one spelling, so a default is never marked changed', () => {
    for (const key of keySettings) {
      const value = SETTINGS[key].default as string
      expect(coerce(key, value), key).toBe(value)
    }
  })

  it('gives no two shortcuts the same key by default, on any platform', () => {
    for (const platform of ['win32', 'linux', 'darwin']) {
      const seen: string[] = []
      for (const key of keySettings) {
        for (const keys of parseKeys(SETTINGS[key].default as string)) {
          expect(
            seen.some((other) => sameKeys(other, keys, platform)),
            `${platform}: ${key} ${keys}`
          ).toBe(false)
          expect(refusal(keys, platform), `${platform}: ${key} ${keys}`).toBeNull()
          seen.push(keys)
        }
      }
    }
  })

  it('stores keys in their one spelling, drops what cannot be used, and keeps an empty choice', () => {
    expect(coerce('shortcuts.playPause', 'ctrl+alt+p')).toBe('Control+Alt+P')
    expect(coerce('shortcuts.playPause', 'Alt+CmdOrCtrl+P  F8 F9')).toBe(
      'CommandOrControl+Alt+P F8'
    )
    expect(coerce('shortcuts.reload', '')).toBe('')
    // Nothing usable in it is not a choice: the default comes back.
    expect(coerce('shortcuts.reload', 'P')).toBe('CommandOrControl+R F5')
    expect(coerce('shortcuts.reload', 42)).toBe('CommandOrControl+R F5')
    // Copy, paste and the media keys are never taken, even from a hand-edited file.
    expect(coerce('shortcuts.playPause', 'CommandOrControl+C MediaPlayPause F7')).toBe('F7')
  })
})
