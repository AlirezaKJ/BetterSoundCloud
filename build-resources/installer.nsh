; Added to the Windows installer by electron-builder (`nsis.include` in electron-builder.yml).
;
; Removes BetterSoundCloud 0.7.x once 0.8.0 or later is installed. v0.7.x was installed by
; Squirrel's Setup.exe or by an MSI, which this installer knows nothing of, so both stayed
; installed side by side: two entries in Apps, two programs called BetterSoundCloud, one of them
; the build whose protected tracks grey out and skip. A user who kept launching the old one would
; report the bug as unfixed.
;
; What it never touches: the profile, %APPDATA%\BetterSoundCloud. 0.7.x and 0.8.0 share it, and
; that is what keeps a Windows upgrader signed in. If a removal fails or is not allowed, 0.8.0
; stays installed beside 0.7.x, and the installer says so (in a message, unless it runs silently).
;
; It runs after 0.8.0's files and shortcuts are in place (`customInstall`), so a cancelled install
; leaves 0.7.x alone; on every later update it finds nothing and does nothing.

!macro customInstall
  Var /GLOBAL oldRemoved   ; "yes" once any 0.7.x was removed
  Var /GLOBAL oldLeft      ; "yes" if a 0.7.x is still installed afterwards
  Var /GLOBAL oldExit
  Var /GLOBAL oldLocalAppData
  Var /GLOBAL oldIndex
  Var /GLOBAL oldKey
  Var /GLOBAL oldPublisher
  Var /GLOBAL oldIsMsi
  Var /GLOBAL oldLength
  Var /GLOBAL oldFirst
  Var /GLOBAL oldLast
  StrCpy $oldRemoved ""
  StrCpy $oldLeft ""

  !insertmacro removeSquirrelBetterSoundCloud
  !insertmacro removeMsiBetterSoundCloud HKCU
  !insertmacro removeMsiBetterSoundCloud HKLM
  ; v0.7.1's MSI is a 32-bit one installed for all users (C:\Program Files (x86)\bettersoundcloud),
  ; so Windows lists it in the registry's 32-bit view, which this 64-bit installer does not read
  ; (measured 2026-10-29). Look there too, then go back to the view the installer uses.
  SetRegView 32
  !insertmacro removeMsiBetterSoundCloud HKLM
  !insertmacro check64BitAndSetRegView

  ; Squirrel's uninstaller deletes the Start Menu and desktop shortcuts by name, and theirs and ours
  ; are both BetterSoundCloud.lnk. Make ours again ("false": recreate rather than keep).
  ${If} $oldRemoved == "yes"
    !insertmacro addStartMenuLink "false"
    !insertmacro addDesktopLink "false"
  ${EndIf}

  ${If} $oldLeft == "yes"
    ; One line: NSIS keeps a continued line's indentation inside the text.
    MessageBox MB_OK|MB_ICONINFORMATION "BetterSoundCloud 0.7 is still installed next to this version, and could not be removed here. Remove it in Settings, Apps: it is the one called bettersoundcloud, version 0.7." /SD IDOK
  ${EndIf}
!macroend

; ── Squirrel's Setup.exe ─────────────────────────────────────────────────────────────────────────
; Per-user: an Apps entry named BetterSoundCloud, files in %LOCALAPPDATA%\BetterSoundCloud, and an
; Update.exe there that uninstalls the app silently with `--uninstall -s` (measured on a v0.7.1
; install, 2026-10-29).
;
; Only from a per-user install. Update.exe sits in the user's own folder, where any program the
; user runs can replace it, and an installer running with administrator rights must not run it.
!macro removeSquirrelBetterSoundCloud
  ReadEnvStr $oldLocalAppData "LOCALAPPDATA"
  ReadRegStr $oldKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetterSoundCloud" "QuietUninstallString"
  ${If} $oldKey != ""
  ${AndIf} ${FileExists} "$oldLocalAppData\BetterSoundCloud\Update.exe"
    ${If} $installMode == "CurrentUser"
      DetailPrint "Removing BetterSoundCloud 0.7 (installed with Setup.exe)"
      ExecWait '"$oldLocalAppData\BetterSoundCloud\Update.exe" --uninstall -s' $oldExit
      DetailPrint "  finished: $oldExit"
      StrCpy $oldRemoved "yes"
      ReadRegStr $oldKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetterSoundCloud" "QuietUninstallString"
      ${If} $oldKey != ""
        StrCpy $oldLeft "yes"
      ${EndIf}
    ${Else}
      StrCpy $oldLeft "yes"
    ${EndIf}
  ${EndIf}

  ; Squirrel's uninstaller leaves its folder behind, marked with a `.dead` file, for a later run of
  ; Squirrel to delete; there is none. On a v0.7.1 install that was the old app's 227 MB executable,
  ; not in use (measured 2026-10-29). Only that folder, only once Squirrel itself marked it dead,
  ; only for this user: it is 0.7.x's program folder. The profile is elsewhere (%APPDATA%).
  ${If} $installMode == "CurrentUser"
  ${AndIf} $oldLocalAppData != ""
  ${AndIf} ${FileExists} "$oldLocalAppData\BetterSoundCloud\.dead"
    Sleep 1500
    RMDir /r "$oldLocalAppData\BetterSoundCloud"
  ${EndIf}
!macroend

; ── The MSI ──────────────────────────────────────────────────────────────────────────────────────
; An Apps entry from Windows Installer (WindowsInstaller = 1) whose publisher is AKJStudio, the
; manufacturer v0.7.x's MSI was built with. Removed through msiexec, Windows' own program, by its
; product code, which must look like a {GUID} first, so nothing read from the registry can reach
; the command line as anything else. An MSI installed for all users makes Windows ask for approval.
!macro removeMsiBetterSoundCloud ROOT
  StrCpy $oldIndex 0
  ${Do}
    EnumRegKey $oldKey ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $oldIndex
    ${If} $oldKey == ""
      ${Break}
    ${EndIf}
    IntOp $oldIndex $oldIndex + 1
    ReadRegStr $oldPublisher ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$oldKey" "Publisher"
    ReadRegDWORD $oldIsMsi ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$oldKey" "WindowsInstaller"
    StrLen $oldLength $oldKey
    StrCpy $oldFirst $oldKey 1
    StrCpy $oldLast $oldKey 1 -1
    ${If} $oldPublisher == "AKJStudio"
    ${AndIf} $oldIsMsi == 1
    ${AndIf} $oldLength == 38
    ${AndIf} $oldFirst == "{"
    ${AndIf} $oldLast == "}"
      DetailPrint "Removing BetterSoundCloud 0.7 (installed from the MSI)"
      ${If} ${Silent}
        ExecWait '"$SYSDIR\msiexec.exe" /x $oldKey /qn /norestart' $oldExit
      ${Else}
        ExecWait '"$SYSDIR\msiexec.exe" /x $oldKey /passive /norestart' $oldExit
      ${EndIf}
      DetailPrint "  finished: $oldExit"
      ReadRegStr $oldPublisher ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$oldKey" "Publisher"
      ${If} $oldPublisher == ""
        ; Gone: the next entry has moved into this one's place in the list.
        StrCpy $oldRemoved "yes"
        IntOp $oldIndex $oldIndex - 1
      ${Else}
        ; Still there (declined, or it failed): leave it, and move on.
        StrCpy $oldLeft "yes"
      ${EndIf}
    ${EndIf}
  ${Loop}
!macroend
