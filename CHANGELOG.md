# Changelog

Each version's entry is also its release notes on GitHub.

## 0.8.0 (not released yet)

BetterSoundCloud rebuilt from scratch. The headline: **the tracks that greyed out and skipped in
0.7.x play now**
([#95](https://github.com/AlirezaKJ/BetterSoundCloud/issues/95),
[#105](https://github.com/AlirezaKJ/BetterSoundCloud/issues/105)). Part of SoundCloud's catalogue
uses Widevine copy protection, and 0.8.0 is signed for it.

0.7.x cannot install 0.8.0 for you, so install it by hand this once. From 0.8.0 on, the Windows
installer and the AppImage keep themselves up to date, and the other builds tell you when a new
version is out.

### Which file?

| You have                         | Download                        |
| -------------------------------- | ------------------------------- |
| Windows 10 or 11                 | `-setup.exe` (the usual choice) |
| Windows, without installing      | `-portable.exe`                 |
| Linux, any distribution          | `.AppImage`                     |
| Debian, Ubuntu, Mint and similar | `.deb`                          |
| Fedora, openSUSE and similar     | `.rpm`                          |

Windows may say "Windows protected your PC" on the first start: choose **More info**, then
**Run anyway**. The app is not signed with a code-signing certificate yet; it does carry the
Widevine signature protected tracks need. There is no macOS build in this release. More detail is
in the [README](https://github.com/AlirezaKJ/BetterSoundCloud#download).

### Coming from 0.7.x

- **Windows:** the installer removes 0.7.x once 0.8.0 is in, whether it came from 0.7.x's
  `Setup.exe` or its `.msi` (which asks for permission, since it was installed for every user).
  **You stay signed in. Your 0.7.x settings do not come across**, so choose your theme and options
  again. The portable build removes nothing: uninstall 0.7.x yourself in Settings → Apps.
- **Linux:** 0.8.0 is an ordinary package, where 0.7.x was a copy of the source code set up by an
  install script. **It starts signed out and with default settings**: 0.7.x kept its data in
  `~/.config/bettersoundcloud` and 0.8.0 keeps it in `~/.config/BetterSoundCloud`, and nothing is
  copied across, on purpose. If your script-installed 0.7.x stopped starting or updating some time
  ago, that was its launcher; there is nothing to repair, just install 0.8.0.
  [How to remove the old copy](https://github.com/AlirezaKJ/BetterSoundCloud#linux).
- **Nix:** the flake is not part of 0.8.0. It built with an Electron that has no Widevine, which is
  exactly the skipping bug this release fixes. It stays on the
  [`legacy/0.7.x`](https://github.com/AlirezaKJ/BetterSoundCloud/tree/legacy/0.7.x) branch.

### New

- **Synced lyrics** in a pane beside the page, and a full-screen view of the track with its artwork
  and lyrics, from [LRCLIB](https://lrclib.net).
- **Themes:** five built in (Dark Cloud, Glassmorphism, Hover, Nocturnal, PostMorphic), or your own
  CSS file, which updates in the app as you save it. A background from the playing track's artwork
  or a picture of your own, and Minimal navigation for SoundCloud's header.
- **Discord Rich Presence** and **Last.fm scrobbling** (a built-in plugin: Settings → Plugins).
  Plugins now run apart from the app.
- **The audio ads between tracks are skipped.** Blocking other ads and trackers is a setting, off
  by default.
- **When SoundCloud cannot load,** the window says why and tries again instead of staying blank.
  Safe mode (`--safe-mode`) starts it with hardware acceleration, ad blocking and the theme off.
- **Settings → Advanced** can clear SoundCloud's cookies and cached data, or reset every setting.
- **On startup, open** Home, Feed, Library, or where you left off. **Minimize to tray on close**
  keeps it playing with the window closed.
- **F6** moves keyboard focus between the bar at the top, SoundCloud's page and the lyrics pane.

### Not back yet

The track downloader, the CSS and JavaScript editor, proxy settings, playback controls in the tray
icon, the Gruvbox theme, and bringing 0.7.x settings across. The auto-scroll button and the shuffle
fix will not come back.

### Known issues

- SoundCloud can still block signing in, liking or following with a message about unusual
  activity. It is the other bug this rebuild set out to fix, and it is not fixed yet.
  [What to try](https://github.com/AlirezaKJ/BetterSoundCloud#soundcloud-keeps-blocking-you-reset-your-profile).
- Signing in with Google, Apple or Facebook does not work inside the app yet. Sign in with your
  email address instead.
- The `.deb` and `.rpm` are new, and less tested than the AppImage.
- Windows on ARM runs the x64 build through emulation, and protected tracks there are untested
  ([#58](https://github.com/AlirezaKJ/BetterSoundCloud/issues/58)).

### Thanks

To @ULTRA-VAGUE, whose install script and launcher carried Linux users through 0.7.x until there
were packages; to @demenik and @silverhadch for the Nix flake; and to everyone who reported the
skipping and blocking bugs in enough detail to find them.

---

_0.7.1 and everything before it, in the words of their original release notes, from the GitHub
releases and the app's old in-app patch notes. Every one of them was a beta. Some of what they
describe is not in 0.8.0: see its "Not back yet"._

## 0.7.1 (2026-05-08)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.7.1)

- Migrated to Castlabs Electron to fix soundcloud added DRM conflict with Electron

## 0.7.0 (2026-05-07)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.7.0)

- Added Glassmorphism Theme By [reoireopit](https://github.com/reoireopit)
- Added Last.fm scrobbling plugin By [zwroee](https://github.com/zwroee)
- Added Last.fm settings UI panel with api key and secret input fields
- Added user agent customization with an input field in the settings
- Added a reset settings button to the loading screen
- Added a copy option to the right click menu
- Added Nix flake support with a desktop entry By [demenik](https://github.com/demenik)
- Added an automated Linux installer with apt, pacman, dnf and zypper support and NVM integration By [ULTRA-VAGUE](https://github.com/ULTRA-VAGUE)
- Added a start.sh launcher for Linux that checks for updates before starting the app
- Added macOS app icon (icon.icns) for cross platform icon support By [droptablemustafa](https://github.com/droptablemustafa)
- Added a theme support button and description inside the themes section for the current theme support situation
- Added a LICENSE file to the repository
- Reworked the DiscordRPC to a modern version By [LudoMinecraft](https://github.com/LudoMinecraft)
- Reworked the glassmorphism theme to use the currently playing song background instead of a static custom bg
- Reworked the themes order based on the current support situation and added the remaining bsc buttons to the glassmorphism theme
- Reworked the header and playbar background to match the new soundcloud theme system
- Reworked the custombg script with a variable bg color for the new soundcloud theme system
- Replaced all audiobar player icons with svgs that color via css variables to match the chosen soundcloud theme
- Replaced all SCI plugin icons with svgs that color via css variables to match the chosen soundcloud theme
- Optimized plugin loading with deferred Last.fm loading and proper error handling
- Optimized the build configuration to use Squirrel and ZIP makers only
- Improved lyric timestamp sync with the music player time
- Improved the lyric page to auto refresh its content on song switch
- Improved lyric sync animation smoothness
- New feature: 1 second delay on lyric search when switching songs to prevent race conditions
- Fixed the DiscordRPC bug by [demenik](https://github.com/demenik)
- Fixed the glassmorphism sync inside the syncsettingsui function
- Fixed the prefrences typo and an unclosed h5 tag inside the loading screen
- Fixed the user agent typo inside the startup config
- Fixed empty user agent input handling on startup
- Fixed the upsell removal logic inside the SCI plugin
- Fixed path joining for cross platform compatibility
- Fixed song downloading by using a separate path for the downloader instead of the actual ASAR path
- Removed old ad plugins (silentad, reloadonads, reloadandplay) since adblocker-electron now handles them
- Removed the premade example file from the download folder
- Removed the paste option from the right click menu until proper implementation

## 0.6.0 (2025-03-23)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.6.0)

- Added LRCLIB for lyrics api instead of genius.
- Added complete adblock using @cliqz/adblocker-electron
- Reworked the loadingscreen for less screentime and a more debuging optimized version
- Reworked the rightclick menu with the new neumorphism version
- Reworked the settings interface which is all connected to one slide and can be scrolled down and up using the sidebar
- Reworked the themes section for further expansion of the themes list
- Reworked the file system so its possible to make linux distributions work
- Optimized custombg plugin image quality to the highest possible
- Optimized in soundcloud fullscreen and maximize buttons to always be in the right class state

## 0.5.3 (2024-03-12)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.3)

- Added deeplinks, load any url with "bsc://"
- Added native MediaKeys integration (play, next, previous)
- Added Tray menu
- Fixed header icons scrollbar bug in high zoom
- Fixed the lyric page to auto refresh on new song
- New feature: auto scroll down button for lazy loading
- New setting option: overall zoom factor
- New setting option: on startup load last page
- Several settings page tweaks and ui fixes

## 0.5.2 (2023-05-13)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.2)

- Added lyric showcase feature (Super Experimental)
- Added custom background feature to replace the unused background of soundcloud
- Added basic tooltip to each setting options
- From now when you download a song using the downloader the folder will automatically open
- Replaced the header bar buttons with icons instead of text (SCI)
- Replaced all UI scrollbars same as the SCI scrollbar
- Improved the song showcase animations
- Improved Esc keypress functionality
- New setting option: handle Cntrl + R
- New setting option: handle F5
- New setting option: turn custombg on and off
- New setting option: turn discordrpc on and off
- New setting option: clear the whole application cache and data
- New setting option: go to soundcloud settings page from bsc settings
- No more errors on creating the bettersoundcloud root folder
- Removed for artist button recently added to soundcloud header

## 0.5.1 (2023-04-09)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.1)

- Added soundcloud downloader in plugins tab
- added custom css and js editor
- added settings menu to customize the app experience

## 0.5.0 (2023-02-21)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.0)

- SCI Feature: added a custom minimize, maximize and close button to main soundcloud header frame
- SCI Feature: added song showcase feature and the button of it to down right
- SCI Feature: removed upload, notification, tripledot and messages button from main soundcloud header frame (as they were useless)
- SCI Feature: added a custom go back and forward button to main soundcloud header frame
- app will start on fullscreen (custom buttons will help you to get out of it)
- removed discord rpc start timestamp as it was useless and no point on it
- From now everytime the app start caches clear to update any theme and plugin changes (including update checker) this may result in a high load time but a auto plugin and themes latest fetching

## 0.4.0 (2023-02-03)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.4.0)

- Added SCI (SoundCloudImprovement) Theme And Plugin By [AlirezaKJ](https://github.com/AlirezaKJ)
- SCI Feature: Removed Try GO+ And Try Next Pro (ADs) Buttons
- SCI Feature: Removed All Products And Discounts (ADs) Banners
- SCI Feature: Added Theme And Plugins Setting Button To Play Controls Bar
- SCI Feature: Replaced Default Browser Scrollbar
- Added Go To Url Option To Right Click Menu
- Updated DiscordRPC Download Link To [This](https://bsc.akjstud.io/)
- Updated Plugin Retrieving From raw.githubusercontent.com To jsdelivr.com For A Better Load
- Created A Custom Page For BetterSoundCloud At: bsc.alirezakj.com (now [bsc.akjstud.io](https://bsc.akjstud.io/))

## 0.3.0 (2023-01-26)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.3.0)

- Added Nocturnal Theme By [Chloe Chantelle](https://userstyles.org/styles/129712/nocturnal-soundcloud-theme)
- Added Post Morphic Theme By [kantraa](https://userstyles.org/styles/253043/post-morphic-soundcloud)
- Added Hover Theme By [TomDom](https://userstyles.org/styles/216317/soundcloud-hover-theme)
- Added Update Checking System
- Added Automatic Patchnotes From CDN
- Added Links To Each Patch Box
- App Dont Automatically Start On Fullscreen Anymore

## 0.2.0 (2023-01-06)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.2.0)

- Added Themes Menu
- Added Dark Cloud Theme By [AlirezaKJ](https://github.com/AlirezaKJ)
- Added Plugins Menu
- Added SilentAd Plugin By [AlirezaKJ](https://github.com/AlirezaKJ)
- Added ReloadOnAd Plugin By [AlirezaKJ](https://github.com/AlirezaKJ)
- Added ReloadAndPlay Plugin By [AlirezaKJ](https://github.com/AlirezaKJ)
- Added Database Features To Save Settings And Prefrences
- Fixed Discord RPC To Show The Big Image Of The Song And Diffrent States

## 0.1.1 (2022-12-22)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V.0.1.1)

- Right Click Menu Added
- Option Menu Added
- Song Cover Added To DiscordRPC

(Design System Update)

## 0.1.0 (2022-12-20)

[On GitHub](https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V.0.1.0)

- Added Discord Rich Presence
- Main And First Release
