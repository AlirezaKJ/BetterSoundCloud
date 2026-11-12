/**
 * Smoke check of the PACKAGED app — the artifact users get, not `npm run dev`.
 *
 * Why it exists: the auto-skip bug (#95, #105) only existed after packing, fusing and signing,
 * so nothing run against the dev build could have caught it. This launches the packed app on a
 * brand-new profile (`--user-data-dir`, so it never touches anyone's real one) with the DevTools
 * protocol on, then checks each feature through our own views' `window.bsc` API. It never clicks
 * anything on SoundCloud and only reads its page: one ordinary page load, signed out.
 *
 * What it cannot check is in docs/RELEASE_CHECKLIST.md: signing in, playing a DRM track, and
 * Castlabs' VMP lab, which need a person.
 *
 * Usage:
 *   npm run smoke:packaged                      the unpacked build in release/
 *   npm run smoke:packaged -- <path-to-exe>     any other packed build
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_EXE = {
  win32: 'release/win-unpacked/BetterSoundCloud.exe',
  darwin: 'release/mac/BetterSoundCloud.app/Contents/MacOS/BetterSoundCloud',
  linux: 'release/linux-unpacked/bettersoundcloud'
}

const exe = process.argv[2] ?? DEFAULT_EXE[process.platform]
if (!exe || !existsSync(exe)) {
  console.error(`No packed app at ${exe}. Run \`npm run pack\` first, or pass the path.`)
  process.exit(2)
}

const PORT = 9333

// Something else already answering on the port would be driven instead of the app this starts:
// a dev app run with `--remoteDebuggingPort 9333` once had its theme, Minimal navigation and
// full-screen view changed by this script, on its real profile (2026-11-12). Refuse instead.
const taken = await fetch(`http://127.0.0.1:${PORT}/json/version`)
  .then(() => true)
  .catch(() => false)
if (taken) {
  console.error(
    `Something already answers on port ${PORT} (another app with remote debugging?). ` +
      'Close it first: this script would drive it instead of the packed app.'
  )
  process.exit(2)
}

const profile = mkdtempSync(join(tmpdir(), 'bsc-smoke-'))
const results = []
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

/** One DevTools protocol connection to one view. */
class View {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.next = 0
    this.pending = new Map()
    this.exceptions = []
    this.opened = new Promise((resolve, reject) => {
      this.socket.onopen = resolve
      this.socket.onerror = reject
    })
    this.socket.onmessage = (message) => {
      const data = JSON.parse(message.data)
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id)(data)
        this.pending.delete(data.id)
      } else if (data.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(data.params.exceptionDetails.exception?.description ?? 'error')
      }
    }
    // A view that closes itself (the lyrics pane's closeLyrics, the showcase's closeShowcase) can
    // go before its answer is sent; that call then answers nothing rather than hanging the run
    // (it did, 2026-11-12).
    this.socket.onclose = () => {
      for (const resolve of this.pending.values()) resolve({})
      this.pending.clear()
    }
  }

  send(method, params = {}) {
    const id = ++this.next
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve) => this.pending.set(id, resolve))
  }

  /** The value of an expression in the view, awaiting it if it is a promise. */
  async run(expression) {
    const reply = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (reply.result?.exceptionDetails) throw new Error(`${expression}: failed in the view`)
    return reply.result?.result?.value
  }
}

/** The first view whose URL matches, once it exists. */
async function view(matches, timeoutMs) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      .then((response) => response.json())
      .catch(() => [])
    const target = list.find((t) => t.type === 'page' && matches(t.url))
    if (target) {
      const connected = new View(target.webSocketDebuggerUrl)
      await connected.opened
      await connected.send('Runtime.enable')
      return connected
    }
    await wait(300)
  }
  return null
}

const app = spawn(exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`], {
  stdio: 'ignore'
})

try {
  const header = await view((url) => url.includes('/header/index.html'), 45000)
  check('the app starts and its header loads', header !== null)
  if (!header) throw new Error('no header view')

  // A fresh profile installs the Widevine CDM first, so allow for the download.
  const page = await view((url) => url.startsWith('https://soundcloud.com'), 90000)
  check('SoundCloud loads once Widevine is ready', page !== null)
  if (!page) throw new Error('no SoundCloud page')
  await wait(6000)

  check('the page sees nothing of ours', (await page.run('typeof window.bsc')) === 'undefined')
  check(
    'our page stylesheet is applied',
    (await page.run(
      `getComputedStyle(document.documentElement).getPropertyValue('--bsc-cover').trim()`
    )) === 'none'
  )
  const identity = await page.run(
    `JSON.stringify([navigator.userAgent, (navigator.userAgentData?.brands ?? []).map((b) => b.brand)])`
  )
  check(
    'the user agent and its client hints do not name the app',
    !/Electron|BetterSoundCloud/i.test(identity),
    identity
  )
  check(
    'Widevine answers the page (a capability probe, not a licence: see the checklist)',
    (await page.run(
      `navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }]).then(() => true, () => false)`
    )) === true
  )
  const cdm = join(profile, 'WidevineCdm')
  check(
    'the Widevine CDM installed into the new profile',
    existsSync(cdm) && readdirSync(cdm).length > 0
  )

  await header.run('window.bsc.toggleSettings()')
  const settings = await view((url) => url.includes('/settings/index.html'), 15000)
  check('Settings opens', settings !== null)
  if (!settings) throw new Error('no settings view')
  await wait(800)

  const themes = await settings.run(
    'window.bsc.listThemes().then((list) => list.map((t) => t.id))'
  )
  check(
    'the built-in themes load from inside the archive',
    themes?.length >= 5,
    themes?.join(', ')
  )
  const plugins = await settings.run(
    'window.bsc.listPlugins().then((list) => list.map((p) => `${p.id}:${p.state}`))'
  )
  check(
    'the bundled Last.fm plugin is found',
    (plugins ?? []).some((p) => p.startsWith('lastfm:')),
    plugins?.join(', ')
  )
  const presence = await settings.run('window.bsc.getPresenceStatus().then((s) => s.state)')
  check('Discord presence reports a state', typeof presence === 'string', presence)

  const column = `getComputedStyle(document.querySelector('#app > .l-container') ?? document.body).backgroundColor`
  await settings.run(`window.bsc.setSetting('appearance.theme', 'darkcloud')`)
  await wait(1500)
  check('a theme restyles SoundCloud’s page', (await page.run(column)) === 'rgb(26, 26, 26)')
  check(
    'a theme recolours our own windows',
    (await settings.run(
      `getComputedStyle(document.documentElement).getPropertyValue('--bsc-bg-primary').trim()`
    )) === '#1a1a1a'
  )

  await settings.run(`window.bsc.setSetting('appearance.theme', 'glassmorphism')`)
  await wait(1500)
  check(
    'a theme that needs a background gets one',
    /blur\(/.test(await page.run(`getComputedStyle(document.body, '::before').filter`))
  )

  await settings.run(`window.bsc.setSetting('appearance.theme', 'vanilla')`)
  await settings.run(`window.bsc.setSetting('appearance.minimalNavigation', true)`)
  await wait(1200)
  check(
    'Minimal navigation turns the nav labels into icons',
    (await page.run(
      `getComputedStyle(document.querySelector("a[href='/discover']")).fontSize`
    )) === '0px'
  )

  // The lyrics pane: it opens beside the page, between SoundCloud's header and play bar, says
  // nothing is playing (nothing plays signed out), and closes. Nothing is looked up on LRCLIB.
  await header.run('window.bsc.toggleLyrics()')
  const lyrics = await view((url) => url.includes('/lyrics/index.html'), 15000)
  check('the lyrics pane opens', lyrics !== null)
  if (lyrics) {
    await wait(500)
    // Two fifths of a narrow window, at most 360px (fitLyricsPane in window.ts). A tiling window
    // manager picks the window's size itself, so work out what the pane should be from the window
    // the header spans: Hyprland tiled it at 820px and the pane was rightly 328 (2026-10-28).
    const windowWidth = await header.run('window.innerWidth')
    const expected = Math.round(Math.min(360, windowWidth * 0.4))
    const size = await lyrics.run('[window.innerWidth, window.innerHeight]')
    check(
      `…as a ${expected}px column beside the page`,
      size?.[0] === expected,
      `${size?.[0]}×${size?.[1]} in a ${windowWidth}px window`
    )
    check(
      '…saying nothing is playing',
      (await lyrics.run('window.bsc.getLyrics().then((s) => s.state)')) === 'idle'
    )
    check(
      'no uncaught errors in the lyrics pane',
      lyrics.exceptions.length === 0,
      lyrics.exceptions[0]
    )
    await lyrics.run('window.bsc.closeLyrics()').catch(() => undefined)
    await wait(800)
    const still = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      .then((response) => response.json())
      .catch(() => [])
    check('…and closes', !still.some((t) => t.url.includes('/lyrics/index.html')))
  }

  // The showcase: the window goes full screen under it, it says nothing is playing, and closing
  // it gives the window back at its old size. The screen flashes full screen for a moment.
  await header.run('window.bsc.openShowcase()')
  const showcase = await view((url) => url.includes('/showcase/index.html'), 15000)
  check('the showcase opens', showcase !== null)
  if (showcase) {
    await wait(1500)
    const size = await showcase.run(
      '[window.innerWidth, window.innerHeight, screen.width, screen.height]'
    )
    check(
      '…full screen',
      size?.[0] === size?.[2] && size?.[1] === size?.[3],
      `${size?.[0]}×${size?.[1]} on a ${size?.[2]}×${size?.[3]} screen`
    )
    check(
      '…saying nothing is playing',
      (await showcase.run(`document.querySelector('h1')?.textContent`)) === 'Nothing is playing'
    )
    check(
      'no uncaught errors in the showcase',
      showcase.exceptions.length === 0,
      showcase.exceptions[0]
    )
    await showcase.run('window.bsc.closeShowcase()').catch(() => undefined)
    await wait(1500)
    const still = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      .then((response) => response.json())
      .catch(() => [])
    const after = await header.run(
      '[window.innerWidth, window.innerHeight, screen.width, screen.height]'
    )
    check(
      '…and leaves full screen as it closes',
      !still.some((t) => t.url.includes('/showcase/index.html')) &&
        (after?.[0] < after?.[2] || after?.[1] < after?.[3]),
      `window ${after?.[0]}×${after?.[1]}`
    )
  }

  // The Equaliser plugin and the audio engine: nothing runs while the curve is flat; with a curve,
  // a hidden view of ours captures SoundCloud's view (nothing plays signed out, so the capture
  // carries silence, but it has to open); turned off, the view is gone.
  const equaliser = () =>
    settings.run(
      `window.bsc.listPlugins().then((list) => { const p = list.find((x) => x.id === 'equaliser'); return p && { state: p.state, lead: p.status && p.status.lead, problem: p.status && p.status.problem } })`
    )
  const audioViews = async () =>
    (
      await fetch(`http://127.0.0.1:${PORT}/json/list`)
        .then((response) => response.json())
        .catch(() => [])
    ).filter((t) => t.url.includes('/audio/index.html')).length
  check('the bundled Equaliser plugin is found, off', (await equaliser())?.state === 'off')
  await settings.run(`window.bsc.setPluginEnabled('equaliser', true)`)
  await wait(2000)
  const flat = await equaliser()
  check(
    '…on and flat, it runs no audio engine',
    flat?.lead === 'Flat' && (await audioViews()) === 0,
    JSON.stringify(flat)
  )
  await settings.run(`window.bsc.setPluginSetting('equaliser', 'curve', '6,4,1,0,0,0')`)
  await wait(3000)
  const shaped = await equaliser()
  check(
    '…with a curve, the engine captures SoundCloud’s view from a hidden view',
    shaped?.lead === 'On' && (await audioViews()) === 1,
    JSON.stringify(shaped)
  )
  await settings.run(`window.bsc.setPluginEnabled('equaliser', false)`)
  await wait(1500)
  check('…and turned off, the engine lets go', (await audioViews()) === 0)

  // Pitch: in the original key it runs no engine. Shifted, the audio view reports running only once
  // its pitch shifter is built, and a shifter that cannot start makes the row say "Not working" —
  // so "On" here means the WebAssembly loaded from app.asar under the audio view's CSP.
  const pitch = () =>
    settings.run(
      `window.bsc.listPlugins().then((list) => { const p = list.find((x) => x.id === 'pitch'); return p && { state: p.state, lead: p.status && p.status.lead, problem: p.status && p.status.problem } })`
    )
  check('the bundled Pitch plugin is found, off', (await pitch())?.state === 'off')
  await settings.run(`window.bsc.setPluginEnabled('pitch', true)`)
  await wait(2000)
  const original = await pitch()
  check(
    '…on in the original key, it runs no audio engine',
    original?.lead === 'Original key' && (await audioViews()) === 0,
    JSON.stringify(original)
  )
  await settings.run(`window.bsc.setPluginSetting('pitch', 'semitones', '3')`)
  await wait(4000)
  const shifted = await pitch()
  check(
    '…shifted, the engine runs with its pitch shifter built',
    shifted?.lead === 'On' && (await audioViews()) === 1,
    JSON.stringify(shifted)
  )
  // The Equaliser still holds its curve from above: one capture serves both.
  await settings.run(`window.bsc.setPluginEnabled('equaliser', true)`)
  await wait(3000)
  const both = [await equaliser(), await pitch()]
  check(
    '…with the Equaliser on too, one capture serves both',
    both.every((p) => p?.lead === 'On') && (await audioViews()) === 1,
    JSON.stringify(both)
  )
  await settings.run(`window.bsc.setPluginEnabled('pitch', false)`)
  await wait(2000)
  const alone = await equaliser()
  check(
    '…Pitch turned off, the Equaliser keeps going',
    alone?.lead === 'On' && (await audioViews()) === 1,
    JSON.stringify(alone)
  )
  await settings.run(`window.bsc.setPluginEnabled('equaliser', false)`)
  await wait(1500)
  check('…and both off, the engine lets go', (await audioViews()) === 0)

  // The Visualizer: on, it runs no engine until the full-screen view shows; there, the engine
  // listens and the view draws on a canvas; closed, the engine lets go. Under reduced motion it is
  // hidden and runs nothing at all.
  const visualizer = () =>
    settings.run(
      `window.bsc.listPlugins().then((list) => { const p = list.find((x) => x.id === 'visualizer'); return p && { state: p.state, lead: p.status && p.status.lead, problem: p.status && p.status.problem } })`
    )
  check('the bundled Visualizer plugin is found, off', (await visualizer())?.state === 'off')
  await settings.run(`window.bsc.setPluginEnabled('visualizer', true)`)
  await wait(2000)
  const ready = await visualizer()
  check(
    '…on, it runs no audio engine until something shows it',
    ready?.state === 'running' && (await audioViews()) === 0,
    JSON.stringify(ready)
  )
  // Its strip above the player waits for a track: the view is made, but with nothing loaded
  // (signed out, here) the page makes no room for it. A track playing is a check by hand.
  const stripViews = async () =>
    (await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())).filter((t) =>
      t.url.includes('/visual-strip/index.html')
    ).length
  const appPadding = () =>
    page.run(`getComputedStyle(document.querySelector('#app')).paddingBottom`)
  check(
    '…its strip above the player waits for a track, with SoundCloud’s page left alone',
    (await stripViews()) === 1 && (await appPadding()) === '0px',
    `${await stripViews()} strip view(s), #app padding ${await appPadding()}`
  )
  await settings.run(`window.bsc.setPluginSetting('visualizer', 'strip', 'off')`)
  await wait(1000)
  check('…set to nothing there, the strip goes', (await stripViews()) === 0)
  await settings.run(`window.bsc.setPluginSetting('visualizer', 'strip', 'bars')`)
  await header.run('window.bsc.openShowcase()')
  const stage = await view((url) => url.includes('/showcase/index.html'), 15000)
  await wait(3000)
  const reduced = stage
    ? await stage.run(`matchMedia('(prefers-reduced-motion: reduce)').matches`)
    : false
  const look = stage
    ? await stage.run(`document.querySelector('[data-bsc-visualizer]')?.dataset.look ?? ''`)
    : ''
  check(
    reduced
      ? '…under reduced motion, the full-screen view draws none and the engine stays off'
      : '…in the full-screen view, the engine listens and its bars are drawn',
    reduced
      ? look === '' && (await audioViews()) === 0
      : look === 'bars' && (await audioViews()) === 1,
    `look "${look}", ${await audioViews()} audio view(s)`
  )
  if (stage) await stage.run('window.bsc.closeShowcase()').catch(() => undefined)
  await wait(2000)
  check('…and the view closed, the engine lets go', (await audioViews()) === 0)
  await settings.run(`window.bsc.setPluginEnabled('visualizer', false)`)
  await wait(1000)
  check('…and the plugin off, its strip goes too', (await stripViews()) === 0)

  check(
    'no uncaught errors in the header',
    header.exceptions.length === 0,
    header.exceptions[0]
  )
  check(
    'no uncaught errors in Settings',
    settings.exceptions.length === 0,
    settings.exceptions[0]
  )

  await header.run('window.bsc.close()').catch(() => undefined)
  const quit = await Promise.race([
    new Promise((resolve) => app.once('exit', () => resolve(true))),
    wait(10000).then(() => false)
  ])
  check('closing the window quits the app', quit)
} catch (error) {
  check('the smoke check ran to the end', false, String(error))
} finally {
  if (app.exitCode === null) app.kill()
  await wait(1000)
  rmSync(profile, { recursive: true, force: true })
  const failed = results.filter((pass) => !pass).length
  console.log(`\n${results.length - failed} of ${results.length} passed`)
  process.exit(failed ? 1 : 0)
}
