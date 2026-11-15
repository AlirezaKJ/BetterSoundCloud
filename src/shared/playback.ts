/**
 * The judgement in Linux's half of the playback and volume shortcuts (main/playback.ts), kept
 * pure so it is tested: which D-Bus name is our own media session, which of the sound server's
 * streams are ours, and what level a volume key leaves them at. Windows does the same in its
 * native helper (native/media-controls).
 */

/**
 * The names `org.freedesktop.DBus.ListNames` answered, from `dbus-send --print-reply`, whose
 * reply holds one `string "…"` per name.
 */
export function readDbusNames(output: string): string[] {
  return [...output.matchAll(/string "([^"]+)"/g)].map((match) => match[1] ?? '')
}

/**
 * Our media session's name among them. Chromium registers its MPRIS player as
 * `org.mpris.MediaPlayer2.<player>.instance<pid>` with the browser process's pid, our main
 * process, so another app's (or another copy's) is never chosen.
 */
export function mprisNameFor(names: readonly string[], pid: number): string | null {
  const suffix = `.instance${pid}`
  return (
    names.find((name) => name.startsWith('org.mpris.MediaPlayer2.') && name.endsWith(suffix)) ??
    null
  )
}

/** One of the sound server's playback streams that is ours. */
export type SinkInput = {
  index: number
  /** Its volume, 1 for 100%, from its loudest channel. */
  level: number
  muted: boolean
}

/**
 * Our streams in `pactl -f json list sink-inputs`: the ones whose `application.process.id` is one
 * of our processes (Chromium plays sound from its audio service process, so main passes every pid
 * it has). Anything not shaped like a stream is skipped.
 */
export function ourSinkInputs(json: unknown, pids: readonly number[]): SinkInput[] {
  if (!Array.isArray(json)) return []
  const out: SinkInput[] = []
  for (const item of json as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const stream = item as Record<string, unknown>
    const properties = stream.properties as Record<string, unknown> | undefined
    const pid = Number(properties?.['application.process.id'])
    if (!Number.isInteger(stream.index) || !pids.includes(pid)) continue
    const channels = Object.values((stream.volume ?? {}) as Record<string, unknown>)
    const percents = channels
      .map((channel) => (channel as Record<string, unknown> | null)?.value_percent)
      .map((text) => (typeof text === 'string' ? Number.parseFloat(text) : Number.NaN))
      .filter((n) => Number.isFinite(n))
    out.push({
      index: stream.index as number,
      level: percents.length > 0 ? Math.max(...percents) / 100 : 1,
      muted: stream.mute === true
    })
  }
  return out
}

/** The level and mute a volume key leaves our sound at, from where the first stream is now. */
export function nextVolume(
  now: { level: number; muted: boolean },
  action: 'up' | 'down' | 'mute',
  step: number
): { level: number; muted: boolean } {
  if (action === 'mute') return { level: now.level, muted: !now.muted }
  const change = action === 'up' ? step : -step
  // On the step's grid, so ten presses up from 33% land on 85%; never past 100%, which the sound
  // server allows but distorts.
  const level = Math.min(1, Math.max(0, Math.round((now.level + change) / step) * step))
  // Turning it up unmutes it, as the system's own volume keys do.
  return { level: Number(level.toFixed(4)), muted: action === 'up' ? false : now.muted }
}
