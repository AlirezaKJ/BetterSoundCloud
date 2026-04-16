#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")/.."

REPO_URL="https://github.com/AlirezaKJ/BetterSoundCloud"

echo "🔄 Checking for updates..."
if git rev-parse --is-inside-work-tree &>/dev/null; then
    git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
    git fetch origin main
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u})
    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "⬆ Updating BetterSoundCloud..."
        git reset --hard origin/main
        git clean -fd
        git pull origin main
    else
        echo "✅ Already up to date."
    fi
else
    echo "⚠️ Not a git repository — skipping update."
fi

echo "▶ Starting BetterSoundCloud..."
npm start
