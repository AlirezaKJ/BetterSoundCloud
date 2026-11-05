import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Small JSON files in the profile directory: plugin state, plugin storage, secrets.
 *
 * Writes go to a temporary file first and are then renamed over the old one, so a crash or a
 * full disk mid-write leaves the previous version intact rather than half a file.
 */

/** The parsed file, or null when it is missing or not valid JSON. */
export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

/** `mode` 0o600 by default: only this user may read these files, where the OS honours it. */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 })
  renameSync(temporary, path)
}

/** A plain object read from a file, or an empty one — never an array, never null. */
export function readRecord(path: string): Record<string, unknown> {
  const value = readJson(path)
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
