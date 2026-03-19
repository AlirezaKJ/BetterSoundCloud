#!/usr/bin/env bash
set -e

APP_NAME="BetterSoundCloud"
INSTALL_DIR="$HOME/BetterSoundCloud"
APP_REPO_URL="https://github.com/AlirezaKJ/BetterSoundCloud"
START_SCRIPT="$INSTALL_DIR/start.sh"
DESKTOP_FILE="$HOME/.local/share/applications/$APP_NAME.desktop"

# Colors for text output
GREEN="\033[0;32m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

# 1. Safety Check: Stop if user runs as root
if [ "$EUID" -eq 0 ]; then
  echo -e "${RED}❌ Error: Do not run as root. The script asks for password when needed.${RESET}"
  exit 1
fi

echo -e "${CYAN}=== Installing $APP_NAME ===${RESET}"

# 2. Function to handle package installation based on OS
install_packages() {
    PACKAGES="$@"
    
    if command -v apt >/dev/null 2>&1; then
        echo -e "${CYAN}Detected system: Debian/Ubuntu (apt)${RESET}"
        sudo apt update
        sudo apt install -y $PACKAGES

    elif command -v pacman >/dev/null 2>&1; then
        echo -e "${CYAN}Detected system: Arch Linux (pacman)${RESET}"
        sudo pacman -S --needed --noconfirm $PACKAGES

    elif command -v dnf >/dev/null 2>&1; then
        echo -e "${CYAN}Detected system: Fedora (dnf)${RESET}"
        sudo dnf install -y $PACKAGES

    elif command -v zypper >/dev/null 2>&1; then
        echo -e "${CYAN}Detected system: openSUSE (zypper)${RESET}"
        sudo zypper install -y $PACKAGES

    else
        echo -e "${RED}❌ Error: Package manager not found. Install git/curl manually.${RESET}"
        exit 1
    fi
}

# 3. Install system tools (git, curl)
echo -e "${CYAN}Checking system requirements...${RESET}"
install_packages git curl

# 4. Check or Install Node.js
if command -v node >/dev/null 2>&1; then
    echo -e "${GREEN}✔ Node.js is already installed.${RESET}"
else
    echo -e "${CYAN}⚙️ Node.js missing. Installing via NVM...${RESET}"
    export NVM_DIR="$HOME/.nvm"

    # Download NVM if missing
    if [ ! -d "$NVM_DIR" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi

    # Load NVM environment
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

    # Verify NVM installation
    if ! command -v nvm >/dev/null 2>&1; then
        echo -e "${RED}❌ Error: NVM failed to load. Please restart terminal.${RESET}"
        exit 1
    fi

    # Install latest LTS version of Node
    nvm install --lts
    nvm use --lts
    
    # Silence npm warnings for this session
    npm config set loglevel error
fi

# 5. Download or Update Source Code
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${CYAN}Updating existing code...${RESET}"
    cd "$INSTALL_DIR"
    git fetch origin main
    git reset --hard origin/main
    git clean -fd
else
    echo -e "${CYAN}Downloading source code...${RESET}"
    rm -rf "$INSTALL_DIR"
    git clone "$APP_REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 6. Install Project Dependencies
echo -e "${CYAN}Installing app libraries...${RESET}"
# --silent and --no-audit hide the deprecation warnings
npm install --silent --no-audit --no-fund --loglevel=error
echo -e "${GREEN}✔ Libraries installed.${RESET}"

# 7. Create Startup Script
echo -e "${CYAN}Creating launcher script...${RESET}"
cat > "$START_SCRIPT" <<EOF
#!/usr/bin/env bash
set -e

# Load NVM
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"

cd "$INSTALL_DIR"

echo "🔄 Checking for updates..."
# Update only if a new version exists
if git fetch origin main --quiet 2>/dev/null; then
    LOCAL=\$(git rev-parse @)
    REMOTE=\$(git rev-parse @{u})
    if [ "\$LOCAL" != "\$REMOTE" ]; then
        echo "⬆ Updating app..."
        git reset --hard origin/main
        git clean -fd
        git pull origin main
        npm install --silent --no-audit --no-fund --loglevel=error
    fi
fi

echo "▶ Starting BetterSoundCloud..."
npm start
EOF

chmod +x "$START_SCRIPT"

# 8. Create Desktop Shortcut
echo -e "${CYAN}Creating desktop entry...${RESET}"
mkdir -p "$(dirname "$DESKTOP_FILE")"

# Find correct icon file
ICON_PATH="$INSTALL_DIR/app/lib/assets/icon.png"
if [ ! -f "$ICON_PATH" ]; then
    ICON_PATH="$INSTALL_DIR/app/lib/assets/icon.ico"
fi
# Fallback if no icon found
if [ ! -f "$ICON_PATH" ]; then
    ICON_PATH="audio-x-generic"
fi

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=$APP_NAME
Exec=$START_SCRIPT
Icon=$ICON_PATH
Type=Application
Terminal=false
Categories=Audio;Music;
Comment=BetterSoundCloud Client
StartupWMClass=BetterSoundCloud
EOF
chmod +x "$DESKTOP_FILE"

echo -e "\n${GREEN}✔ Installation complete!${RESET}"
echo -e "Run with: ${CYAN}$START_SCRIPT${RESET}"
