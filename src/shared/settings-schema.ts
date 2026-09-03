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

/**
 * How each section is written in the UI. Capitalising the key gave "Lastfm", and no
 * amount of CSS fixes a name that has a full stop in the middle of it.
 */
export const SECTION_LABELS: Record<Section, string> = {
  general: 'General',
  appearance: 'Appearance',
  discord: 'Discord',
  lastfm: 'Last.fm',
  shortcuts: 'Shortcuts',
  advanced: 'Advanced'
}

/** Rendered under a control whose effect is not immediate. */
export const APPLIES_NOTES = {
  reload: 'Applies to the next page load — reload SoundCloud to see it now.',
  restart: 'Takes effect after restarting BetterSoundCloud.'
} as const

type Base = {
  readonly label: string
  readonly section: Section
  /** Shown under the control in the settings UI. */
  readonly help?: string
  /**
   * Set to `false` while the feature behind a setting does not exist yet. The settings
   * panel renders those disabled with a "not implemented yet" note instead of offering a
   * control that silently does nothing. Omit it once the setting is actually read
   * somewhere — an omitted `wired` means the setting works.
   *
   * This exists because the schema is written ahead of the features. Without it, the
   * release meant to restore trust would ship eight toggles that do nothing.
   */
  readonly wired?: false
  /**
   * When the effect lands, if not immediately. Omitted means immediate.
   *
   * Most settings apply live: the main process reads them per request or re-injects CSS
   * into the open document. A few cannot. Saying so in the schema rather than in prose
   * keeps the claim next to the setting and testable — see the guard in the test that
   * forbids hand-typed "requires a restart" help strings.
   */
  readonly applies?: 'reload' | 'restart'
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
    section: 'general',
    wired: false
  },
  'general.minimizeToTray': {
    kind: 'boolean',
    default: false,
    label: 'Minimize to tray on close',
    section: 'general',
    help: 'The tray exists; this still needs a quitting flag so tray Quit is not swallowed.',
    wired: false
  },
  'general.checkForUpdates': {
    kind: 'boolean',
    default: true,
    label: 'Check for updates automatically',
    section: 'general',
    help: 'Disabled automatically when installed from a distro package or Nix.',
    wired: false
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
  'appearance.colorScheme': {
    kind: 'enum',
    default: 'system',
    options: ['system', 'light', 'dark'],
    label: 'Appearance',
    section: 'appearance',
    help:
      'Applies to BetterSoundCloud’s own chrome, and to SoundCloud’s page wherever it ' +
      'follows the system light or dark preference.'
  },
  'appearance.hideMenuBar': {
    kind: 'boolean',
    default: false,
    label: 'Hide the BetterSoundCloud bar',
    section: 'appearance',
    help:
      'Gives the whole window to SoundCloud and moves the window buttons into its own ' +
      'header. Toggle it from the expand button at either end — the top bar, or ' +
      'SoundCloud’s header once it is hidden.'
  },
  'appearance.fullWidthLayout': {
    kind: 'boolean',
    default: true,
    label: 'Stretch the SoundCloud bars',
    section: 'appearance',
    help:
      'SoundCloud centres its top menu and bottom player at 1240px. This stretches those ' +
      'two bars to the window width. Page content keeps its own layout.'
  },
  'appearance.theme': {
    kind: 'string',
    default: 'vanilla',
    label: 'Theme',
    section: 'appearance',
    help: 'Filename stem of a CSS file in the themes folder.',
    wired: false
  },

  'discord.enabled': {
    kind: 'boolean',
    default: true,
    label: 'Discord Rich Presence',
    section: 'discord',
    wired: false
  },
  'discord.showWhenPaused': {
    kind: 'boolean',
    default: false,
    label: 'Keep showing presence while paused',
    section: 'discord',
    wired: false
  },

  'lastfm.enabled': {
    kind: 'boolean',
    default: false,
    label: 'Last.fm scrobbling',
    section: 'lastfm',
    wired: false
  },

  'shortcuts.mediaKeys': {
    kind: 'boolean',
    default: true,
    label: 'Respond to media keys',
    section: 'shortcuts',
    help:
      'Will be handled by SoundCloud’s own Media Session handlers — BetterSoundCloud ' +
      'will not synthesise clicks on the player.',
    wired: false
  },

  // On by default, unlike the filter-list blocker below. This one is a single request to a
  // single known endpoint — it needs no engine, no downloaded list and no network fetch, and
  // it cannot touch sign-in or playback. Blocking it lands on a path SoundCloud's own client
  // already handles: its `parse()` returns `{ is_malformed: true }` when the response has no
  // `promoted` key.
  'advanced.blockAudioAds': {
    kind: 'boolean',
    default: true,
    label: 'Skip the audio ads between tracks',
    section: 'advanced',
    help:
      'Blocks the request SoundCloud makes when an audio ad is due, so the ad never loads. ' +
      'Works on its own — the filter-list blocker below does not need to be on. Takes effect ' +
      'from the next ad; one already playing will finish.'
  },

  // Off by default, deliberately. v0.7.x fetched 14 filter lists at every launch inside a
  // `dom-ready` handler with no `await` and no `catch`, so whether blocking was active varied
  // run to run — which is why the sign-in reports could not be reproduced. v2 ships a
  // prebuilt engine and never filters SoundCloud's own hosts, but the sign-in cluster is
  // still open, so this stays opt-in until it is closed.
  'advanced.adBlocker': {
    kind: 'boolean',
    default: false,
    label: 'Block other ads and trackers',
    section: 'advanced',
    // `reload`, unlike the audio-ad setting above. This one governs scripts rather than one
    // endpoint: switching it ON cannot unload trackers the page has already run, and
    // switching it OFF cannot fetch back what was blocked earlier in the document's life —
    // so a page that loaded while blocking was on stays degraded until it is reloaded. That
    // OFF direction is the one users hit, because turning the blocker off is exactly what
    // someone does when a page looks broken.
    applies: 'reload',
    help:
      'Blocks display ads and third-party tracking scripts using filter lists. Sign-in, ' +
      'anti-bot checks and playback are never filtered. Audio ads have their own setting above.'
  },

  'advanced.hardwareAcceleration': {
    kind: 'boolean',
    default: true,
    label: 'Hardware acceleration',
    section: 'advanced',
    applies: 'restart',
    help:
      'Lets the GPU decode audio and draw the page. Turn it off only if you see visual ' +
      'glitches or the window renders blank.'
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
