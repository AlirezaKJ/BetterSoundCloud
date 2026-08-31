/**
 * The single source of truth for settings.
 *
 * Every setting is defined exactly once, here. The TypeScript type, the settings form,
 * the persisted defaults and the validation all derive from this object. v0.7.x defined
 * each setting in four places — markup in `app/index.html`, a `dbResolve` in
 * `settings.js`, a `dbSetItem` in `updateLS()`, and a `querySelector` + listener in
 * `ui.js` — and they drifted.
 *
 * Adding a setting means adding one entry here and nothing else.
 */

export const SECTIONS = [
  'general',
  'appearance',
  'discord',
  'lastfm',
  'shortcuts',
  'advanced'
] as const

export type Section = (typeof SECTIONS)[number]

type Base = {
  readonly label: string
  readonly section: Section
  /** Shown under the control in the settings UI. */
  readonly help?: string
}

export type SettingDef =
  | (Base & { readonly kind: 'boolean'; readonly default: boolean })
  | (Base & {
      readonly kind: 'number'
      readonly default: number
      readonly min: number
      readonly max: number
      readonly step?: number
    })
  | (Base & { readonly kind: 'string'; readonly default: string })
  | (Base & {
      readonly kind: 'enum'
      readonly default: string
      readonly options: readonly string[]
    })

export const SETTINGS = {
  'general.startupUrl': {
    kind: 'enum',
    default: 'discover',
    options: ['discover', 'stream', 'library', 'lastVisited'],
    label: 'On startup, open',
    section: 'general'
  },
  'general.minimizeToTray': {
    kind: 'boolean',
    default: false,
    label: 'Minimize to tray on close',
    section: 'general'
  },
  'general.checkForUpdates': {
    kind: 'boolean',
    default: true,
    label: 'Check for updates automatically',
    section: 'general',
    help: 'Disabled automatically when installed from a distro package or Nix.'
  },

  'appearance.zoomFactor': {
    kind: 'number',
    default: 100,
    min: 10,
    max: 500,
    step: 5,
    label: 'Zoom',
    section: 'appearance',
    help: 'Percent.'
  },
  'appearance.theme': {
    kind: 'string',
    default: 'vanilla',
    label: 'Theme',
    section: 'appearance',
    help: 'Filename stem of a CSS file in the themes folder.'
  },

  'discord.enabled': {
    kind: 'boolean',
    default: true,
    label: 'Discord Rich Presence',
    section: 'discord'
  },
  'discord.showWhenPaused': {
    kind: 'boolean',
    default: false,
    label: 'Keep showing presence while paused',
    section: 'discord'
  },

  'lastfm.enabled': {
    kind: 'boolean',
    default: false,
    label: 'Last.fm scrobbling',
    section: 'lastfm'
  },

  'shortcuts.mediaKeys': {
    kind: 'boolean',
    default: true,
    label: 'Respond to media keys',
    section: 'shortcuts',
    help:
      'Handled by SoundCloud’s own Media Session handlers. BetterSoundCloud never ' +
      'synthesises clicks on the player.'
  },

  // Off by default, deliberately. In v0.7.x the blocker was registered inside a
  // `dom-ready` handler with no await and no catch, depending on a live fetch of 14
  // filter lists at every launch — so whether it was even active varied run to run.
  'advanced.adBlocker': {
    kind: 'boolean',
    default: false,
    label: 'Block ads and trackers',
    section: 'advanced',
    help: 'Experimental. May interfere with sign-in. Off by default.'
  },
  'advanced.hardwareAcceleration': {
    kind: 'boolean',
    default: true,
    label: 'Hardware acceleration',
    section: 'advanced',
    help: 'Requires a restart.'
  }
} as const satisfies Record<string, SettingDef>

export type SettingKey = keyof typeof SETTINGS

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * You do not need to read or change anything below to add a setting.
 * Add an entry to SETTINGS above and you are done — the type, the settings form
 * and the validation all follow automatically.
 *
 * The two types below are what makes that true. They are the only clever code in
 * this file, and they are worth it: the alternative is hand-writing the `Settings`
 * type as well, which means every new setting is two edits in two places that can
 * drift apart. Avoiding exactly that is why this file exists — v0.7.x defined each
 * setting in four places and they did drift.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Maps one schema entry to the type of its value:
 *   { kind: 'boolean' }                      -> boolean
 *   { kind: 'number' }                       -> number
 *   { kind: 'enum', options: ['a', 'b'] }    -> 'a' | 'b'
 *   { kind: 'string' }                       -> string
 */
type ValueOf<Def> = Def extends { kind: 'boolean' }
  ? boolean
  : Def extends { kind: 'number' }
    ? number
    : Def extends { kind: 'enum'; options: readonly (infer Option)[] }
      ? Option
      : Def extends { kind: 'string' }
        ? string
        : never

/**
 * The settings object, with one correctly-typed property per entry in SETTINGS.
 * `-readonly` strips the `as const` readonly markers so settings stay assignable.
 */
export type Settings = {
  -readonly [K in SettingKey]: ValueOf<(typeof SETTINGS)[K]>
}

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[]

export function defaults(): Settings {
  const out = {} as Record<string, unknown>
  for (const key of SETTING_KEYS) out[key] = SETTINGS[key].default
  return out as Settings
}

/**
 * Coerce an untrusted value to a valid one for `key`, falling back to the default.
 * Used on both sides of IPC — the renderer must not be trusted to have validated,
 * and a hand-edited config file must not be able to poison the app.
 */
export function coerce<K extends SettingKey>(key: K, value: unknown): Settings[K] {
  const def: SettingDef = SETTINGS[key]

  switch (def.kind) {
    case 'boolean':
      return (typeof value === 'boolean' ? value : def.default) as Settings[K]

    case 'number': {
      const n = typeof value === 'number' && Number.isFinite(value) ? value : def.default
      return Math.min(def.max, Math.max(def.min, n)) as Settings[K]
    }

    case 'enum':
      return (
        typeof value === 'string' && def.options.includes(value) ? value : def.default
      ) as Settings[K]

    case 'string':
      return (typeof value === 'string' ? value : def.default) as Settings[K]
  }
}

export function coerceAll(input: Partial<Record<string, unknown>>): Settings {
  const out = {} as Record<string, unknown>
  for (const key of SETTING_KEYS) out[key] = coerce(key, input[key])
  return out as Settings
}

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SETTINGS, value)
}
