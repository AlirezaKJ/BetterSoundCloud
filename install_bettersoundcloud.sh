#!/usr/bin/env bash
set -e

echo "🔹 BetterSoundCloud Linux Installer"

APP_DIR="$HOME/BetterSoundCloud"
DESKTOP_FILE="$HOME/.local/share/applications/BetterSoundCloud.desktop"
ICON_PATH="$APP_DIR/app/lib/assets/icon.ico"

echo "📦 Installing prerequisites..."

if command -v apt &>/dev/null; then
    sudo apt update && sudo apt install -y git nodejs npm curl
elif command -v pacman &>/dev/null; then
    sudo pacman -Syu --noconfirm git nodejs npm curl
elif command -v dnf &>/dev/null; then
    sudo dnf install -y git nodejs npm curl
elif command -v zypper &>/dev/null; then
    sudo zypper install -y git nodejs npm curl
else
    echo "❌ Unsupported package manager. Install git, nodejs, npm manually."
    exit 1
fi

echo "📥 Cloning or updating BetterSoundCloud..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git reset --hard origin/main
    git clean -fd
    git pull origin main
else
    git clone https://github.com/AlirezaKJ/BetterSoundCloud "$APP_DIR"
fi

echo "📦 Installing Node.js dependencies..."
cd "$APP_DIR"
npm install

echo "⚙️ Creating start.sh..."
cat > "$APP_DIR/start.sh" <<EOF
#!/usr/bin/env bash
cd "\$(dirname "\${BASH_SOURCE[0]}")"
echo "🔄 Updating BetterSoundCloud..."
git reset --hard origin/main
git clean -fd
git pull origin main
echo "▶ Starting BetterSoundCloud..."
npm start
EOF
chmod +x "$APP_DIR/start.sh"

echo "📄 Creating .desktop entry..."
mkdir -p "$(dirname "$DESKTOP_FILE")"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=BetterSoundCloud
Exec=$APP_DIR/start.sh
Icon=$ICON_PATH
Type=Application
Terminal=true
Categories=Audio;Music;
Comment=Enhanced SoundCloud desktop client
EOF

chmod +x "$DESKTOP_FILE"

echo "✅ BetterSoundCloud installed successfully!"
echo "Run it from your Applications menu or execute:"
echo "bash $APP_DIR/start.sh"
