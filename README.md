# BetterSoundCloud

[![Downloads](https://img.shields.io/github/downloads/AlirezaKJ/BetterSoundCloud/total.svg)](https://github.com/AlirezaKJ/BetterSoundCloud/releases)

SoundCloud on your desktop, in a window of its own. BetterSoundCloud runs SoundCloud's own web player and adds what a browser tab can't: synced lyrics, Discord Rich Presence, Last.fm scrobbling, themes, plugins, and skipping the audio ads between tracks.

It is not made by SoundCloud.

## Download

Get the latest version from the
**[releases page](https://github.com/AlirezaKJ/BetterSoundCloud/releases/latest)**, and pick the
file for your system:

| You have                         | Download the file ending in     | New versions                    |
| -------------------------------- | ------------------------------- | ------------------------------- |
| Windows 10 or 11                 | `-setup.exe` (the usual choice) | Installs them itself            |
| Windows, without installing      | `-portable.exe`                 | Tells you, with a download link |
| Linux, any distribution          | `.AppImage`                     | Installs them itself            |
| Debian, Ubuntu, Mint and similar | `.deb`                          | Tells you, with a download link |
| Fedora, openSUSE and similar     | `.rpm`                          | Tells you, with a download link |
| macOS                            | Not available yet (see below)   |                                 |

You can turn update checks off in Settings → General.

**On Windows**, the first start may show "Windows protected your PC". Choose **More info**, then **Run anyway**. The warning is there because the app is not signed with a code-signing certificate, which costs money the project does not have yet. The Windows builds do carry the Widevine signature that SoundCloud's protected tracks need: that signature is what fixed the
tracks that skipped in 0.7.x.

**On Linux:**

- The AppImage: make it executable with `chmod +x BetterSoundCloud-*.AppImage`, then run it. It
  does not add itself to your app menu yet.
- The `.deb`: `sudo apt install ./BetterSoundCloud-*.deb`
- The `.rpm`: `sudo dnf install ./BetterSoundCloud-*.rpm`

The AppImage is the most tested of the three; the `.deb` and `.rpm` are new.

**To check a download**, compare it with `SHA256SUMS.txt` from the same release: on Linux,
`sha256sum -c --ignore-missing SHA256SUMS.txt` in the download folder; on Windows,
`Get-FileHash <the file>` in PowerShell, which should print the same number as the file's line.

**Not available yet:**

- **macOS.** A Mac app has to be notarized by Apple to open without a fight, and that costs money
  the project does not have yet. Building it from source works, but such a build cannot play
  SoundCloud's protected tracks.
- **Windows on ARM** runs the x64 build through Windows' own emulation. It should work, but nobody
  has checked protected tracks on it yet. If you have such a machine, a report on
  [#58](https://github.com/AlirezaKJ/BetterSoundCloud/issues/58) would help.

## Upgrading from 0.7.x

### Windows

Run the `-setup.exe`. Once 0.8.0 is installed, it removes 0.7.x for you, whether you installed
0.7.x with its `Setup.exe` or its `.msi`. The `.msi` installed 0.7.x for every user of the
computer, so Windows asks for permission to remove it. If you say no, both stay installed; you can
remove 0.7.x later in Settings → Apps, where it is listed as "bettersoundcloud", version 0.7.

- **You stay signed in.** Both versions keep your sign-in in the same place.
- **Your 0.7.x settings do not come across.** Choose your theme and options again in Settings.
- **The portable build removes nothing.** If you use it, remove 0.7.x yourself in Settings → Apps.
  If you used 0.7.x's `.zip`, delete its folder.
- If an old taskbar pin no longer opens anything, unpin it and pin BetterSoundCloud again.

### Linux

0.7.x on Linux was a copy of the source code, set up by an install script and updated from GitHub
every time it started. 0.8.0 is an ordinary package. It starts signed out and with default
settings, because it keeps its data in a different folder from 0.7.x.

After installing 0.8.0, remove the old copy:

```bash
rm -rf ~/BetterSoundCloud                                   # 0.7.x's source code
rm -f ~/.local/share/applications/BetterSoundCloud.desktop  # its app-menu entry
rm -rf ~/.config/bettersoundcloud                           # its sign-in and settings
```

Mind the capitals. `~/.config/bettersoundcloud`, all lowercase, is 0.7.x's;
`~/.config/BetterSoundCloud` belongs to 0.8.0, so keep that one. If the install script also
installed Node.js for you (in `~/.nvm`), remove it only if nothing else of yours uses it.

## What's new in 0.8.0

0.8.0 is BetterSoundCloud rebuilt from scratch.

- **Protected tracks play.** In 0.7.x, part of SoundCloud's catalogue greyed out and skipped
  ([#95](https://github.com/AlirezaKJ/BetterSoundCloud/issues/95),
  [#105](https://github.com/AlirezaKJ/BetterSoundCloud/issues/105)). Those tracks use Widevine
  copy protection, and 0.8.0 is signed for it.
- **It keeps itself up to date**, from the Windows installer and the AppImage. The other builds
  tell you when a new version is out.
- **Linux packages**: an AppImage, a `.deb` and an `.rpm`, instead of an install script.
- **Synced lyrics** in a pane beside the page, and a full-screen view of the track with its
  artwork and lyrics. Lyrics come from [LRCLIB](https://lrclib.net), and only while one of those
  is open.
- **Themes**: five built in (Dark Cloud, Glassmorphism, Hover, Nocturnal and PostMorphic), or your
  own as a CSS file, which updates in the app as you save it
  ([guide](docs/CUSTOM_THEMES.md)). A background from the playing track's artwork or from a
  picture of your own. Minimal navigation, which fits SoundCloud's header links into half the
  width.
- **Discord Rich Presence**, on by default, and **Last.fm scrobbling**, a built-in plugin you turn
  on and connect in Settings → Plugins. Each plugin runs on its own, apart from the app, and one
  you add yourself lists what it needs before you turn it on ([guide](docs/CUSTOM_PLUGINS.md)).
- **The audio ads between tracks are skipped.** Blocking other ads and trackers is a setting, off
  by default.
- **It tells you when something is wrong.** If SoundCloud cannot load, the window says why and
  tries again, instead of staying blank. Safe mode (below) starts it with the usual suspects
  turned off.
- **You choose what opens at startup**: Home, Feed, Library, or where you left off. Closing the
  window can keep it playing in the tray instead of quitting.
- **Keyboard**: F6 moves between the bar at the top, SoundCloud's page and the lyrics pane.

### Not back yet

These were in 0.7.x and are planned, but are not in 0.8.0:

- the track downloader
- the CSS and JavaScript editor (a theme file covers CSS for now)
- proxy settings
- play, pause and skip from the tray icon
- the Gruvbox theme
- bringing your 0.7.x settings across

Two 0.7.x features will not come back: the auto-scroll button, which SoundCloud's own endless
scrolling has replaced, and the shuffle fix. The reasons are in the project's
[backlog](docs/TODO.md#explicitly-declined).

## Known issues

- **SoundCloud can still block signing in, liking or following** with a message about unusual
  activity. This is the other bug 0.8.0 set out to fix, and it is not fixed yet. See
  [what to try](#soundcloud-keeps-blocking-you-reset-your-profile).
- **Signing in with Google, Apple or Facebook does not work inside the app yet.** Those open in
  your web browser, and the app stays signed out. Sign in with your email address instead.
- **Casting to a Chromecast does not work** in the app: the part of Chrome that casting needs is not
  part of the app.

## Troubleshooting

### The window is blank or broken: start in safe mode

Quit BetterSoundCloud first (a second copy only brings the running one forward), then start it
with `--safe-mode`:

| System              | Command                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Windows (installer) | Press Win+R, then `"%LOCALAPPDATA%\Programs\BetterSoundCloud\BetterSoundCloud.exe" --safe-mode`    |
| Windows (portable)  | From a command prompt in its folder: `BetterSoundCloud-<version>-win-x64-portable.exe --safe-mode` |
| Linux (deb, rpm)    | `bettersoundcloud --safe-mode`                                                                     |
| Linux (AppImage)    | `./BetterSoundCloud-<version>-linux-x86_64.AppImage --safe-mode`                                   |

For that launch only, safe mode turns off hardware acceleration (the usual cause of a blank
window), ad blocking and your theme. It changes no setting, and Settings says it is on. If the app
works in safe mode, one of those three is the cause: in Settings, switch one of them off
(Hardware acceleration first), then quit and start normally, and repeat until it works. If you
installed somewhere other than the default folder, use that path instead.

### SoundCloud keeps blocking you: reset your profile

Try this first, from inside the app: **Settings → Advanced → Clear cache and site data**. It signs
you out and removes the cookies, stored data and cached files SoundCloud keeps on your computer,
which is most of what deleting the profile folder does, but keeps your settings, plugins, Last.fm
connection and Widevine. Then sign in again.

If you are still blocked, reset the whole profile. Deleting the profile folder cleared the "you
have been blocked" page for a user on
[#97](https://github.com/AlirezaKJ/BetterSoundCloud/issues/97). It is not a guaranteed fix, and it
costs you this: you are signed out, your settings and window size go back to their defaults, the
themes and plugins you added and your Last.fm connection are gone, and Widevine downloads again
on the next start. Quit the app, then **rename** the folder (for example to `BetterSoundCloud.old`)
rather than deleting it, so you can copy your themes and plugins back:

| System  | Profile folder                                                                           |
| ------- | ---------------------------------------------------------------------------------------- |
| Windows | `%APPDATA%\BetterSoundCloud`                                                             |
| Linux   | `~/.config/BetterSoundCloud` (a lowercase `bettersoundcloud` folder is v0.7.x's, unused) |

Uninstalling does not remove it, so reinstalling alone changes nothing.

### On Linux, it closes at once when started from a terminal

Started from a terminal inside VS Code or another app built on Electron, the AppImage, `.deb` and
`.rpm` builds exit straight away
([Castlabs #165](https://github.com/castlabs/electron-releases/issues/165)). Starting it from the
app menu or dock is not affected. From such a terminal, start it with
`env -u CHROME_DESKTOP bettersoundcloud`, or
`env -u CHROME_DESKTOP ./BetterSoundCloud-<version>-linux-x86_64.AppImage`.

## Questions

**How do I open Settings?** With the gear button in the bar at the top, or right-click anywhere
and choose Settings.

**Is it safe for my SoundCloud account?** BetterSoundCloud is SoundCloud's own website in a
window. It presents itself to SoundCloud as the Chromium browser it is built on, with nothing
faked, and it never clicks or types on SoundCloud's page for you.

**What does it connect to?** SoundCloud, and whatever SoundCloud's page itself loads. Besides
that: Google, to download Widevine on the first start and keep it up to date; GitHub, to check for new versions,
unless you turn that off; LRCLIB, only while the lyrics are open; the Discord app on your own
computer, while Rich Presence is on; and Last.fm, if you turn its plugin on. There are no
analytics.

**I found a bug, or have an idea.** Please
[open an issue](https://github.com/AlirezaKJ/BetterSoundCloud/issues). Say which file you
installed (installer, portable, AppImage, `.deb` or `.rpm`) and your system: they fail in
different ways.

## Contributing

Building from source, the rules every change is reviewed against, and how releases are made:
[CONTRIBUTING.md](CONTRIBUTING.md).

If BetterSoundCloud is useful to you, you can
[buy me a coffee](https://www.buymeacoffee.com/alirezakj).

## Licence

MIT. See [LICENSE](LICENSE).
