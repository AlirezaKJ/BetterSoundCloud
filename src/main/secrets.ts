import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { readRecord, writeJson } from './json-file'

/**
 * Secrets — session keys, tokens, API secrets — encrypted by the operating system.
 *
 * Kept strictly apart from settings-store.ts, as its header already says. electron-store's
 * `encryptionKey` is not encryption: the key ships inside the app, so it only stops someone
 * editing the file by hand (roadmap decision #10, corrected 2026-08-31). This goes through
 * `safeStorage` instead: DPAPI on Windows, the Keychain on macOS, libsecret/kwallet on Linux.
 *
 * The baseline it replaces: v0.7.x kept the Last.fm shared secret in plain text in
 * soundcloud.com's own localStorage, readable by any script on that origin.
 *
 * Each value is stored under a namespace — a plugin's id — so one plugin cannot read
 * another's. The file holds ciphertext only, base64-encoded.
 *
 * NO FALLBACK. On a Linux desktop with no keyring, Electron "encrypts" with a hard-coded
 * password, which is not encryption at all. Rather than store a secret that way and let the
 * user believe it is protected, every write throws a plain-language error the caller shows.
 */

type Vault = Record<string, string>

let cache: Vault | null = null

function file(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

/** Why secrets cannot be stored on this computer, or '' when they can. Only valid after ready. */
export function secretsUnavailableReason(): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return 'This computer has no system keychain BetterSoundCloud can use, so secrets cannot be stored safely.'
  }
  if (
    process.platform === 'linux' &&
    safeStorage.getSelectedStorageBackend() === 'basic_text'
  ) {
    return (
      'No keyring is running (GNOME Keyring or KWallet), so secrets cannot be stored safely. ' +
      'Start one and restart BetterSoundCloud.'
    )
  }
  return ''
}

export function getSecret(namespace: string, key: string): string | null {
  const stored = load()[slot(namespace, key)]
  if (stored === undefined || secretsUnavailableReason()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    // Written under another OS account or a reinstalled keychain: unreadable, so absent.
    return null
  }
}

export function setSecret(namespace: string, key: string, value: string): void {
  const reason = secretsUnavailableReason()
  if (reason) throw new Error(reason)
  const vault = load()
  vault[slot(namespace, key)] = safeStorage.encryptString(value).toString('base64')
  save(vault)
}

export function deleteSecret(namespace: string, key: string): void {
  const vault = load()
  if (!(slot(namespace, key) in vault)) return
  delete vault[slot(namespace, key)]
  save(vault)
}

/** Every secret in a namespace — for removing a plugin's secrets with the plugin. */
export function deleteSecrets(namespace: string): void {
  const vault = load()
  const prefix = `${namespace}\u0000`
  const keys = Object.keys(vault).filter((k) => k.startsWith(prefix))
  if (keys.length === 0) return
  for (const k of keys) delete vault[k]
  save(vault)
}

/** A NUL separator: it cannot appear in a plugin id or a key, so no two slots can collide. */
function slot(namespace: string, key: string): string {
  return `${namespace}\u0000${key}`
}

function load(): Vault {
  cache ??= Object.fromEntries(
    Object.entries(readRecord(file())).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
  return cache
}

function save(vault: Vault): void {
  cache = vault
  writeJson(file(), vault)
}
