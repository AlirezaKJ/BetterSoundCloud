import { join } from 'node:path'
import { WebContentsView } from 'electron'
import type { WebContents } from 'electron'
import { CH } from '@shared/ipc'
import {
  AUDIO_LIMITS,
  NOT_STARVED,
  combinePitch,
  describeAudioStop,
  headroomDb,
  isFlat,
  isStarved,
  noteCaptureClock,
  noteCaptureSilence
} from '@shared/audio'
import type {
  AudioConfig,
  AudioEngineState,
  AudioFilter,
  AudioReport,
  AudioStopReason,
  Starvation
} from '@shared/audio'
import type { AudioStatus } from '@shared/plugin-api'
import type { VisualFrame } from '@shared/visualizer'
import type { Identity } from '@shared/identity'
import { expectTabAudioCapture, hardenSession, routeNewWindowsToBrowser } from './session'
import { onNowPlayingChange } from './now-playing'
import { isDev } from './env'

/**
 * The audio engine (CLAUDE.md §21): what lets a plugin with the `audio` permission change how
 * SoundCloud sounds, without a line of code in SoundCloud's page.
 *
 * HOW. A hidden view of ours (renderer/audio, never shown, never in the window) captures the
 * content view's own audio output — `getMediaSourceId` and `chromeMediaSource: 'tab'`, the
 * machinery browser equaliser extensions use — shifts its pitch if a plugin asks, runs it through
 * the plugins' filters and plays the result. While the capture runs, Chromium plays the content
 * view only into it; when the capture ends, the content view plays normally again. Measured
 * 2026-11-09 in this Electron: the capture carries Widevine-encrypted audio, and adds about 0.1 s;
 * the pitch shifter adds its own 0.08 s while it runs.
 *
 * WHY IT CANNOT BREAK SOUNDCLOUD. The app never mutes SoundCloud: the capture does, and only
 * while it lives, so every way this can fail — the audio view crashing, the capture failing to
 * start, a plugin stopping — ends with SoundCloud's own sound. And the engine runs only while some
 * plugin is asking for a change: no filters, or flat ones, mean no capture, no view, and the app
 * exactly as it was. Safe mode never starts it.
 *
 * STEPPING ASIDE. A failure that would only repeat — the capture refused, the view crashing
 * twice, SoundCloud playing while the capture hears nothing — stops the engine until nothing is
 * asking for it any more: turning the plugin off and on tries again. A pitch shifter that cannot
 * start stops it only until nothing asks for a shift, so turning Pitch off is enough for the
 * Equaliser to work again.
 *
 * LISTENING. A visualizer on screen (§22, main/visualizer.ts) is a reason to run too: the view then
 * reads what it plays at the very end of its chain and sends it here about 60 times a second, and
 * the frames go on to whichever view is drawing. Off screen, it asks for nothing.
 */

/** What the engine needs to run: the view to capture, and how to make a view of ours. */
export type AudioTarget = {
  content: WebContents
  identity: Identity
  /** `rendererUrl('audio')`, passed in so this module needs nothing from window.ts. */
  url: string
}

/** The capture ending by itself this many times in a row means it will keep doing it. */
const MAX_ENDINGS = 3
/** A crashed audio view is made again after this long, once. */
const RESTART_DELAY_MS = 1_000

let safeMode = false
let target: AudioTarget | null = null
/** Each plugin's filters, by plugin id. Applied in id order, so the order never shuffles. */
const chains = new Map<string, AudioFilter[]>()
/** Each plugin's key shift in semitones, by plugin id. They add up. */
const pitches = new Map<string, number>()
let view: WebContentsView | null = null
let viewReady = false
/** Good for one capture; a new view needs a new one. */
let sourceId = ''
let engine: AudioEngineState = { state: 'off' }
/** Why the engine stepped aside, until nothing is asking for it any more. */
let latched: { reason: AudioStopReason; detail: string } | null = null
let starvation: Starvation = NOT_STARVED
let crashes = 0
let endings = 0
let restartTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(status: AudioStatus) => void>()
/** Whether a visualizer is on screen, so the engine should run and send what it plays. */
let visualWanted = false
/** Whether that visualizer is MilkDrop, so each frame should carry the channels too. */
let waveWanted = false
const frameListeners = new Set<(frame: VisualFrame) => void>()
let started = false

/** Once, at startup. In safe mode the engine never runs. */
export function startAudioEngine(options: { safeMode: boolean }): void {
  safeMode = options.safeMode
  if (started) return
  started = true
  onNowPlayingChange((nowPlaying) => {
    if (engine.state !== 'running') return
    starvation = noteCaptureClock(
      starvation,
      nowPlaying && {
        track: nowPlaying.url || `${nowPlaying.artist}\n${nowPlaying.title}`,
        elapsed: nowPlaying.elapsed,
        playing: nowPlaying.playing
      }
    )
    if (isStarved(starvation)) stepAside('no-sound', '')
  })
}

/** A window exists: its content view is what gets captured. */
export function attachAudioEngine(next: AudioTarget): void {
  target = next
  reconcile()
}

/** The window is gone. Plugins may still be asking; the engine waits for the next window. */
export function detachAudioEngine(): void {
  target = null
  destroyView()
  reconcile()
}

/** A plugin's filters, already shaped by `readAudioFilters`. An empty list removes them. */
export function setAudioFilters(owner: string, filters: readonly AudioFilter[]): void {
  if (filters.length === 0) chains.delete(owner)
  else chains.set(owner, [...filters])
  reconcile()
}

/** A plugin's key shift, already shaped by `readAudioPitch`. 0 removes it. */
export function setAudioPitch(owner: string, semitones: number): void {
  if (semitones === 0) pitches.delete(owner)
  else pitches.set(owner, semitones)
  reconcile()
}

/**
 * Whether a visualizer is on screen (main/visualizer.ts decides), and whether it reads the
 * channels (MilkDrop). True runs the engine.
 */
export function setAudioVisual(wanted: boolean, wave = false): void {
  const nextWave = wanted && wave
  if (wanted === visualWanted && nextWave === waveWanted) return
  visualWanted = wanted
  waveWanted = nextWave
  reconcile()
}

/** A frame from the audio view, already shaped by `readVisualFrame`. */
export function handleVisualFrame(frame: VisualFrame): void {
  // A frame still in flight when the last visualizer closed is nobody's.
  if (!visualWanted) return
  for (const listener of frameListeners) {
    try {
      listener(frame)
    } catch (error) {
      console.error('[audio] frame listener failed:', error)
    }
  }
}

export function onVisualFrame(listener: (frame: VisualFrame) => void): () => void {
  frameListeners.add(listener)
  return () => {
    frameListeners.delete(listener)
  }
}

/** A plugin stopped, or asked for nothing: its filters and its shift go. */
export function clearAudio(owner: string): void {
  const hadFilters = chains.delete(owner)
  const hadPitch = pitches.delete(owner)
  if (hadFilters || hadPitch) reconcile()
}

export function getAudioStatus(): AudioStatus {
  return statusFor(engine)
}

export function onAudioStatusChange(listener: (status: AudioStatus) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether `contents` is the audio view, for main's sender check on its reports. */
export function isAudioView(contents: WebContents): boolean {
  return view !== null && !view.webContents.isDestroyed() && contents === view.webContents
}

/** What the audio view says, already shaped by `readAudioReport`. */
export function handleAudioReport(report: AudioReport): void {
  switch (report.kind) {
    case 'running':
      crashes = 0
      endings = 0
      setEngine({ state: 'running' })
      return
    case 'failed':
      stepAside('capture-failed', report.message)
      return
    case 'pitch-failed':
      stepAside('pitch-failed', report.message)
      return
    case 'ended':
      // The content view's renderer went away, for one; capture it again from a fresh view.
      endings += 1
      if (endings >= MAX_ENDINGS) {
        stepAside('capture-failed', 'it kept stopping')
        return
      }
      destroyView()
      reconcile()
      return
    case 'silence':
      starvation = noteCaptureSilence(starvation, report.silent)
      return
  }
}

/** Every plugin's filters, in plugin-id order, within the chain limit. */
function combinedFilters(): AudioFilter[] {
  return [...chains.keys()]
    .sort()
    .flatMap((owner) => chains.get(owner) ?? [])
    .slice(0, AUDIO_LIMITS.maxChain)
}

/** Make the engine match what is asked of it. Safe to call at any time, as often as wanted. */
function reconcile(): void {
  const filters = combinedFilters()
  const pitch = combinePitch(pitches.values())
  // The shifter failing says nothing about the rest: once nothing asks for a shift, try again.
  if (latched?.reason === 'pitch-failed' && pitch === 0) latched = null
  if (pitch === 0 && (filters.length === 0 || isFlat(filters)) && !visualWanted) {
    // Nothing is asked: forget any earlier failure, so asking again tries again.
    latched = null
    crashes = 0
    endings = 0
    destroyView()
    setEngine({ state: 'off' })
    return
  }
  if (safeMode) {
    setEngine({ state: 'stopped', reason: 'safe-mode', detail: '' })
    return
  }
  if (latched) {
    destroyView()
    setEngine({ state: 'stopped', reason: latched.reason, detail: latched.detail })
    return
  }
  if (engine.state !== 'running') setEngine({ state: 'starting' })
  if (!target || restartTimer) return
  if (!view) createView(target)
  else sendConfig()
}

function createView(on: AudioTarget): void {
  const next = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/chrome.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev,
      // Never shown, so Chromium would treat it as a background page: its timers (the silence
      // check) slowed to once a minute, and its AudioContext held until a user gesture.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  hardenSession(next.webContents.session, on.identity)
  routeNewWindowsToBrowser(next.webContents)
  view = next
  viewReady = false
  sourceId = ''
  starvation = NOT_STARVED

  next.webContents.once('did-finish-load', () => {
    if (view !== next) return
    viewReady = true
    sendConfig()
  })
  next.webContents.on('render-process-gone', (_event, details) => {
    if (view === next) viewGone(details.reason)
  })
  if (isDev) console.log('[audio] starting the engine')
  void next.webContents.loadURL(on.url)
}

function sendConfig(): void {
  if (!view || !viewReady || !target || view.webContents.isDestroyed()) return
  if (target.content.isDestroyed()) return
  if (!sourceId) {
    try {
      // The session grants this one capture request, and only for as long as the id lives.
      expectTabAudioCapture(target.content)
      sourceId = target.content.getMediaSourceId(view.webContents)
    } catch (error) {
      stepAside('capture-failed', error instanceof Error ? error.message : String(error))
      return
    }
  }
  const filters = combinedFilters()
  const config: AudioConfig = {
    sourceId,
    pitch: combinePitch(pitches.values()),
    filters,
    preampDb: -headroomDb(filters),
    visual: visualWanted,
    visualWave: waveWanted
  }
  view.webContents.send(CH.audioConfigure, config)
}

/** The audio view's renderer ended. SoundCloud is already playing normally again. */
function viewGone(reason: string): void {
  view = null
  viewReady = false
  sourceId = ''
  crashes += 1
  if (crashes >= 2) {
    stepAside('crashed', reason)
    return
  }
  console.warn(`[audio] the engine's view ended (${reason}); starting it again`)
  restartTimer = setTimeout(() => {
    restartTimer = null
    reconcile()
  }, RESTART_DELAY_MS)
}

function stepAside(reason: AudioStopReason, detail: string): void {
  latched = { reason, detail }
  destroyView()
  setEngine({ state: 'stopped', reason, detail })
}

function destroyView(): void {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
  const old = view
  view = null
  viewReady = false
  sourceId = ''
  starvation = NOT_STARVED
  // Closing ends the capture, and with it Chromium gives the content view its own sound back.
  if (old && !old.webContents.isDestroyed()) old.webContents.close()
}

function setEngine(next: AudioEngineState): void {
  if (JSON.stringify(next) === JSON.stringify(engine)) return
  engine = next
  // In every build, like [updates]: an engine that stepped aside is how a problem gets reported.
  if (engine.state === 'stopped') {
    console.warn(
      `[audio] stopped: ${engine.reason}${engine.detail ? ` (${engine.detail})` : ''}`
    )
  } else if (isDev) {
    console.log(`[audio] ${engine.state}`)
  }
  const status = statusFor(engine)
  for (const listener of listeners) {
    try {
      listener(status)
    } catch (error) {
      console.error('[audio] listener failed:', error)
    }
  }
}

function statusFor(state: AudioEngineState): AudioStatus {
  return {
    state: state.state,
    message: state.state === 'stopped' ? describeAudioStop(state.reason, state.detail) : ''
  }
}

/** For tests: forget everything. */
export function resetAudioEngineForTests(): void {
  destroyView()
  chains.clear()
  pitches.clear()
  listeners.clear()
  frameListeners.clear()
  visualWanted = false
  waveWanted = false
  engine = { state: 'off' }
  latched = null
  target = null
  crashes = 0
  endings = 0
  safeMode = false
}
