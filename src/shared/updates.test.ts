import { describe, it, expect } from 'vitest'
import {
  describeUpdateStatus,
  installKind,
  isUpdateAction,
  readUpdateError,
  releasePageUrl,
  updateNotification,
  updateReach
} from './updates'
import type { InstallFacts, InstallKind, UpdateState, UpdateStatus } from './updates'

const facts = (over: Partial<InstallFacts>): InstallFacts => ({
  platform: 'linux',
  isPackaged: true,
  portableDir: undefined,
  appImage: undefined,
  packageType: null,
  updateConfig: true,
  ...over
})

const status = (
  state: UpdateState,
  over: Partial<Omit<UpdateStatus, keyof UpdateState>> = {}
): UpdateStatus => ({ current: '0.8.0', auto: true, kind: 'installer', ...over, ...state })

describe('installKind', () => {
  it('tells every way this app is shipped apart', () => {
    expect(installKind(facts({ isPackaged: false }))).toBe('source')
    expect(installKind(facts({ platform: 'win32' }))).toBe('installer')
    expect(
      installKind(facts({ platform: 'win32', portableDir: 'C:\\Users\\a\\Downloads' }))
    ).toBe('portable')
    expect(installKind(facts({ appImage: '/home/a/BetterSoundCloud.AppImage' }))).toBe(
      'appimage'
    )
    expect(installKind(facts({ packageType: 'deb' }))).toBe('deb')
    expect(installKind(facts({ packageType: 'rpm' }))).toBe('rpm')
    expect(installKind(facts({ platform: 'darwin' }))).toBe('mac')
  })

  it('leaves anything it does not recognise to whoever installed it', () => {
    // An unpacked folder, a Nix build, a distro's own package (pacman writes its own type).
    expect(installKind(facts({}))).toBe('other')
    expect(installKind(facts({ packageType: 'pacman' }))).toBe('other')
    // A Windows folder from `electron-builder --dir`: no update file, so nothing to update.
    expect(installKind(facts({ platform: 'win32', updateConfig: false }))).toBe('other')
  })

  it('trusts the AppImage runtime over a package-type file', () => {
    expect(installKind(facts({ appImage: '/a.AppImage', packageType: 'deb' }))).toBe('appimage')
  })
})

describe('updateReach', () => {
  it('installs only where the copy can replace itself without root', () => {
    const reach = (kind: InstallKind) => updateReach(kind)
    expect([reach('installer'), reach('appimage')]).toEqual(['install', 'install'])
    expect([reach('portable'), reach('deb'), reach('rpm'), reach('mac')]).toEqual([
      'tell',
      'tell',
      'tell',
      'tell'
    ])
    expect([reach('source'), reach('other')]).toEqual(['none', 'none'])
  })
})

describe('describeUpdateStatus', () => {
  it('offers one button at a time, and none while busy', () => {
    const action = (s: UpdateStatus) => describeUpdateStatus(s).action?.action ?? null
    expect(action(status({ state: 'idle' }))).toBe('check')
    expect(action(status({ state: 'checking' }))).toBeNull()
    expect(action(status({ state: 'current' }))).toBe('check')
    expect(action(status({ state: 'available', version: '0.8.1' }))).toBe('download')
    expect(action(status({ state: 'available', version: '0.8.1' }, { kind: 'portable' }))).toBe(
      'open-release'
    )
    expect(action(status({ state: 'downloading', version: '0.8.1', percent: 40 }))).toBeNull()
    expect(action(status({ state: 'ready', version: '0.8.1' }))).toBe('install')
    expect(action(status({ state: 'not-here' }, { kind: 'source' }))).toBeNull()
  })

  it('names the versions, so a support reply can ask for them', () => {
    expect(describeUpdateStatus(status({ state: 'current' }))).toMatchObject({
      lead: 'Up to date',
      detail: '0.8.0 is the newest version.'
    })
    expect(
      describeUpdateStatus(status({ state: 'available', version: '0.8.1' }))
    ).toMatchObject({
      lead: '0.8.1 is available',
      detail: 'You have 0.8.0.'
    })
  })

  it('says how to get the update where the copy cannot install it', () => {
    const detail = (kind: InstallKind) =>
      describeUpdateStatus(status({ state: 'available', version: '0.8.1' }, { kind })).detail
    expect(detail('portable')).toMatch(/portable copy can’t replace itself/)
    expect(detail('deb')).toMatch(/\.deb/)
    expect(detail('rpm')).toMatch(/\.rpm/)
  })

  it('promises an install on quit only while automatic updates are on', () => {
    const ready = { state: 'ready', version: '0.8.1' } as const
    expect(describeUpdateStatus(status(ready)).detail).toMatch(/next time you quit/)
    expect(describeUpdateStatus(status(ready, { auto: false })).detail).not.toMatch(/quit/)
  })

  it('shows progress as a plain percentage once there is one', () => {
    expect(
      describeUpdateStatus(status({ state: 'downloading', version: '0.8.1', percent: null }))
    ).toMatchObject({ lead: 'Downloading 0.8.1…', detail: '' })
    // The lead ends in an ellipsis, so the line reads "Downloading 0.8.1… 42%".
    expect(
      describeUpdateStatus(status({ state: 'downloading', version: '0.8.1', percent: 42 }))
        .detail
    ).toBe('42%')
  })

  it('puts a failure in its own line and offers to try again', () => {
    const offline = describeUpdateStatus(
      status({ state: 'failed', during: 'check', failure: { kind: 'offline' } })
    )
    expect(offline).toMatchObject({
      lead: 'Couldn’t check for updates',
      problem: 'You seem to be offline.',
      action: { action: 'check', label: 'Try again' }
    })
    const download = describeUpdateStatus(
      status({
        state: 'failed',
        during: 'download',
        version: '0.8.1',
        failure: { kind: 'other', message: 'sha512 checksum mismatch' }
      })
    )
    expect(download.lead).toBe('Couldn’t download 0.8.1')
    expect(download.problem).toMatch(/sha512 checksum mismatch/)
    expect(download.action?.action).toBe('download')
  })

  it('tells a copy run from source apart from one installed some other way', () => {
    expect(describeUpdateStatus(status({ state: 'not-here' }, { kind: 'source' })).lead).toBe(
      'Running from source'
    )
    expect(describeUpdateStatus(status({ state: 'not-here' }, { kind: 'other' })).lead).toBe(
      'Updated elsewhere'
    )
  })
})

describe('updateNotification', () => {
  it('speaks up only when there is something to do', () => {
    expect(updateNotification(status({ state: 'ready', version: '0.8.1' }))).toEqual({
      title: 'BetterSoundCloud 0.8.1 is ready',
      body: 'Restart to update, or it installs the next time you quit.'
    })
    expect(
      updateNotification(status({ state: 'available', version: '0.8.1' }, { kind: 'deb' }))
        ?.title
    ).toBe('BetterSoundCloud 0.8.1 is available')

    // Mid-download, checking, up to date: nothing to act on yet.
    expect(updateNotification(status({ state: 'available', version: '0.8.1' }))).toBeNull()
    expect(updateNotification(status({ state: 'current' }))).toBeNull()
    expect(
      updateNotification(status({ state: 'downloading', version: '0.8.1', percent: 3 }))
    ).toBeNull()
  })
})

describe('readUpdateError', () => {
  const coded = (code: string, message = 'x') => Object.assign(new Error(message), { code })

  it('reads a newest release without an update feed as nothing newer', () => {
    // True of V0.7.1, today's newest release, made before this updater existed.
    expect(readUpdateError(coded('ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'))).toEqual({
      kind: 'no-update'
    })
    expect(readUpdateError(coded('ERR_UPDATER_NO_PUBLISHED_VERSIONS'))).toEqual({
      kind: 'no-update'
    })
  })

  it('recognises being offline, whichever layer noticed', () => {
    expect(readUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED'))).toEqual({
      kind: 'offline'
    })
    // electron-updater wraps network failures in its own code; the cause is in the message.
    expect(
      readUpdateError(
        coded(
          'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
          'Unable to find latest version: net::ERR_NAME_NOT_RESOLVED'
        )
      )
    ).toEqual({ kind: 'offline' })
    expect(readUpdateError(new Error('getaddrinfo ENOTFOUND github.com'))).toEqual({
      kind: 'offline'
    })
  })

  it('keeps only the readable first line of anything else', () => {
    const failure = readUpdateError(
      new Error('Cannot parse releases feed: boom\nXML:\n<feed>…')
    )
    expect(failure).toEqual({ kind: 'other', message: 'Cannot parse releases feed: boom' })
    expect(readUpdateError(undefined)).toEqual({ kind: 'other', message: 'undefined' })
  })
})

describe('isUpdateAction', () => {
  it('accepts the four actions and nothing else', () => {
    for (const action of ['check', 'download', 'install', 'open-release']) {
      expect(isUpdateAction(action)).toBe(true)
    }
    for (const junk of ['quit', '', null, 1, { action: 'check' }]) {
      expect(isUpdateAction(junk)).toBe(false)
    }
  })
})

describe('releasePageUrl', () => {
  it('links a version to its release, and anything else to the list', () => {
    expect(releasePageUrl('0.8.1')).toBe(
      'https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/v0.8.1'
    )
    expect(releasePageUrl('0.9.0-beta.1')).toBe(
      'https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/v0.9.0-beta.1'
    )
    expect(releasePageUrl('../../evil')).toBe(
      'https://github.com/AlirezaKJ/BetterSoundCloud/releases'
    )
  })
})
