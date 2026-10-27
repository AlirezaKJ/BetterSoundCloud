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
    const size = await lyrics.run('[window.innerWidth, window.innerHeight]')
    check('…as a 360px column beside the page', size?.[0] === 360, `${size?.[0]}×${size?.[1]}`)
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
