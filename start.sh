#!/usr/bin/env bash
#
# BetterSoundCloud no longer runs from a copy of its source code. This file starts nothing.
#
# It is here only for people who installed v0.7.x with install_bettersoundcloud.sh. Their app-menu
# entry runs ~/BetterSoundCloud/start.sh, which updated that copy from GitHub's main branch and
# started it. From v0.8.0 the app ships as an AppImage, a .deb and an .rpm, so the copy they have
# can no longer be built or started that way. Their launcher pulls this file in on its next run,
# and from then on clicking the menu entry says where the new version is: a notification, the
# download page in the browser, and the same words in a terminal. It runs no git and no npm.
#
# Keep it, and install_bettersoundcloud.sh, until those installs have had time to see it
# (docs/TODO.md, Milestone 2). scripts/start.mjs runs it too, on that launcher's first run.

PAGE="https://github.com/AlirezaKJ/BetterSoundCloud/releases/latest"
TITLE="BetterSoundCloud has moved"
BODY="This copy can no longer update or start. Install BetterSoundCloud 0.8 or later from its \
download page: the AppImage, or the .deb or .rpm for your system."

echo "$TITLE"
echo "$BODY"
echo "  $PAGE"
echo "Once the new version is installed, you can delete ~/BetterSoundCloud and"
echo "~/.local/share/applications/BetterSoundCloud.desktop."

if command -v notify-send >/dev/null 2>&1; then
  notify-send --app-name=BetterSoundCloud "$TITLE" "$BODY" || true
fi
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$PAGE" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$PAGE" || true
fi
exit 0
