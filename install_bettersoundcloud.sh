#!/usr/bin/env bash
#
# The source installer for Linux, retired with v0.8.0. It installs nothing now.
#
# Until then the README said to run it with `bash <(curl -fsSL …/main/install_bettersoundcloud.sh)`.
# It cloned the source, ran npm and set up a launcher that updated that copy on every start. From
# v0.8.0 the app ships as packages instead, so this file stays at the same address only to say so,
# rather than answering an old link with a 404 page that bash then tries to run. See start.sh.

cat <<'EOF'
BetterSoundCloud no longer installs from its source code.

From version 0.8.0 it comes as ready-made packages. Download the one for your system:
  https://github.com/AlirezaKJ/BetterSoundCloud/releases/latest

    AppImage   runs on most distributions, and updates itself
    .deb       Debian, Ubuntu, Linux Mint and the like
    .rpm       Fedora, openSUSE and the like

If you installed an older version with this script, you can delete ~/BetterSoundCloud and
~/.local/share/applications/BetterSoundCloud.desktop once the new one is installed.
EOF
exit 1
