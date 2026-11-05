import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/*
 * build-resources/installer.nsh, the part of the Windows installer that removes BetterSoundCloud
 * 0.7.x. NSIS cannot run here, so this holds the script to the rules it was measured against on
 * 2026-10-29 (Squirrel's Setup.exe install and the all-users MSI, both removed, profile untouched):
 * the rules a later edit must not lose.
 */

const ROOT = join(import.meta.dirname, '../..')
const SCRIPT = readFileSync(join(ROOT, 'build-resources/installer.nsh'), 'utf8')
/** Code only: NSIS comments start with `;` or `#`. */
const CODE = SCRIPT.split('\n')
  .map((line) => line.replace(/^\s*[;#].*$/, ''))
  .join('\n')

describe('the installer script that removes 0.7.x', () => {
  it('is the one electron-builder uses', () => {
    const yml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/^nsis:[\s\S]*?^ {2}include: build-resources\/installer\.nsh$/m)
  })

  it('acts only once this version is installed, so a cancelled install leaves 0.7.x alone', () => {
    expect(CODE).toMatch(/!macro customInstall\b/)
    expect(CODE).not.toMatch(/!macro (customInit|preInit)\b/)
  })

  it('never deletes anything but 0.7.x’s own program folder, and never the profile', () => {
    // 0.7.x and this version share %APPDATA%\BetterSoundCloud: it is what keeps a user signed in.
    // NSIS's $APPDATA, the APPDATA environment variable, or a Roaming path: all of them the profile.
    expect(CODE).not.toMatch(/\$APPDATA\b|"APPDATA"|\\Roaming/i)
    const deletions = [...CODE.matchAll(/^\s*(RMDir|Delete)\b.*$/gm)].map((m) => m[0].trim())
    expect(deletions).toEqual(['RMDir /r "$oldLocalAppData\\BetterSoundCloud"'])
    // And only once Squirrel itself marked that folder dead, with LOCALAPPDATA known.
    expect(CODE).toMatch(/\$oldLocalAppData != ""[\s\S]*?\.dead"[\s\S]*?RMDir \/r/)
  })

  it('runs Squirrel’s uninstaller only from a per-user install', () => {
    // Update.exe is in the user's own folder, where anything the user runs can replace it.
    const squirrel = CODE.slice(CODE.indexOf('!macro removeSquirrelBetterSoundCloud'))
    const guard = squirrel.indexOf('$installMode == "CurrentUser"')
    const run = squirrel.indexOf('Update.exe" --uninstall -s')
    expect(guard).toBeGreaterThan(-1)
    expect(run).toBeGreaterThan(guard)
  })

  it('hands msiexec only a product code shaped like a {GUID}, and reads both registry views', () => {
    const msi = CODE.slice(CODE.indexOf('!macro removeMsiBetterSoundCloud'))
    for (const check of [
      '$oldLength == 38',
      '$oldFirst == "{"',
      '$oldLast == "}"',
      '$oldIsMsi == 1'
    ]) {
      expect(msi.indexOf(check), check).toBeGreaterThan(-1)
      expect(msi.indexOf(check), check).toBeLessThan(msi.indexOf('msiexec.exe'))
    }
    // v0.7.1's MSI is 32-bit, listed only in the registry's 32-bit view.
    expect(CODE).toMatch(/SetRegView 32\s+!insertmacro removeMsiBetterSoundCloud HKLM/)
  })

  it('puts back the shortcuts Squirrel’s uninstaller deletes by their shared name', () => {
    expect(CODE).toMatch(
      /\$oldRemoved == "yes"[\s\S]*?addStartMenuLink "false"[\s\S]*?addDesktopLink "false"/
    )
  })
})
