import Store from 'electron-store'
import { coerce, coerceAll, defaults, isSettingKey } from '@shared/settings-schema'
import type { SettingKey, Settings } from '@shared/settings-schema'

/**
 * Settings live in the main process, not renderer `localStorage`.
 *
 * v0.7.x kept them in the renderer, which meant "Reset Settings" was
 * `localStorage.clear()` (nuking the whole origin) and main-process services could not
 * read a setting without a round trip.
 *
 * Note there is no `encryptionKey` here. electron-store's encryption key ships inside
 * the asar, so it is obfuscation against hand-editing and nothing more; treating it as
 * security is worse than not having it. Secrets — the Last.fm shared secret, tokens —
 * go through `safeStorage` (DPAPI / Keychain / libsecret) in their own service when
 * Phase 3 lands. Nothing secret belongs in this file.
 */

type Persisted = {
  schemaVersion: number
  values: Partial<Record<string, unknown>>
}

const SCHEMA_VERSION = 1

/**
 * Constructed on first use, never at import.
 *
 * electron-store resolves its file path from `app.getPath('userData')` in its
 * constructor. This module is imported at the top of `index.ts`, which is *before*
 * `app.setPath('userData')` switches dev onto its own profile — so building the store
 * eagerly captured the default path and made dev and installed builds share one
 * settings file. Toggling a setting in one silently changed the other, which is a
 * genuinely confusing way to lose an afternoon.
 */
let store: Store<Persisted> | null = null

function db(): Store<Persisted> {
  store ??= new Store<Persisted>({
    name: 'settings',
    defaults: { schemaVersion: SCHEMA_VERSION, values: {} }
  })
  return store
}

let cache: Settings | null = null

export function getAll(): Settings {
  if (cache) return cache
  cache = coerceAll(migrate(db().store).values)
  return cache
}

export function get<K extends SettingKey>(key: K): Settings[K] {
  return getAll()[key]
}

/** Returns the full settings object so callers always see a consistent snapshot. */
export function set(key: unknown, value: unknown): Settings {
  if (!isSettingKey(key)) {
    // Not an error the user can cause through the UI — it means a bug or a hostile
    // renderer. Ignore it rather than persisting an unknown key.
    return getAll()
  }
  const next = { ...getAll() } as Record<SettingKey, unknown>
  next[key] = coerce(key, value)
  cache = next as Settings
  db().set('values', cache)
  return cache
}

/** Preserves window state; only the schema-defined values are reset. */
export function reset(): Settings {
  cache = defaults()
  db().set('values', cache)
  return cache
}

function migrate(raw: Persisted): Persisted {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0

  if (version === SCHEMA_VERSION) return raw

  // v0 is "anything written before this file existed". There is no v0.7.x import path
  // yet — that decision is open (the old values lived in renderer localStorage under a
  // different naming scheme). Until then, start clean rather than guess.
  const migrated: Persisted = {
    schemaVersion: SCHEMA_VERSION,
    values: version === 0 ? {} : (raw.values ?? {})
  }
  db().store = migrated
  return migrated
}
