#!/usr/bin/env bash
set -e

APP_NAME="BetterSoundCloud"
INSTALLER_DIR="$HOME/${APP_NAME}-Linux-Installer"
APP_DIR="$HOME/${APP_NAME}-App"
ICON_PATH="$APP_DIR/app/lib/assets/icon.ico"
DESKTOP_FILE="$HOME/.local/share/applications/$APP_NAME.desktop"
START_SCRIPT="$INSTALLER_DIR/start.sh"

INSTALLER_REPO_URL="https://github.com/ULTRA-VAGUE/BetterSoundCloud-On-Linux"
APP_REPO_URL="https://github.com/AlirezaKJ/BetterSoundCloud"

GREEN="\033[0;32m"
CYAN="\033[0;36m"
RESET="\033[0m"

echo -e "${CYAN}=== Installing $APP_NAME ===${RESET}"

# --- Detect package manager ---
if command -v apt >/dev/null 2>&1; then
    PM="apt"
    INSTALL_CMD="sudo apt update && sudo apt install -y"
elif command -v pacman >/dev/null 2>&1; then
    PM="pacman"
    INSTALL_CMD="sudo pacman -Sy --noconfirm"
elif command -v dnf >/dev/null 2>&1; then
    PM="dnf"
    INSTALL_CMD="sudo dnf install -y"
elif command -v zypper >/dev/null 2>&1; then
    PM="zypper"
    INSTALL_CMD="sudo zypper install -y"
else
    echo "❌ Unsupported Linux distribution."
    exit 1
fi

echo -e "${CYAN}Detected package manager: $PM${RESET}"

# --- Install prerequisites ---
echo -e "${CYAN}Installing dependencies (git, nodejs, npm, curl)...${RESET}"
case "$PM" in
    apt)
        $INSTALL_CMD git curl nodejs npm || {
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt install -y nodejs git npm curl
        }
        ;;
    pacman)
        $INSTALL_CMD git nodejs npm curl
        ;;
    dnf)
        $INSTALL_CMD git nodejs npm curl
        ;;
    zypper)
        $INSTALL_CMD git nodejs npm curl
        ;;
esac
echo -e "${GREEN}✔ Dependencies installed.${RESET}\n"

# --- Clone or update installer repo ---
if [ -d "$INSTALLER_DIR/.git" ]; then
    echo -e "${CYAN}Updating existing installer repository...${RESET}"
    cd "$INSTALLER_DIR"
    git remote set-url origin "$INSTALLER_REPO_URL"
    git reset --hard origin/main
    git clean -fd
    git pull origin main
else
    echo -e "${CYAN}Cloning installer repository into $INSTALLER_DIR...${RESET}"
    git clone "$INSTALLER_REPO_URL" "$INSTALLER_DIR"
fi

# --- Clone or update app repo ---
if [ -d "$APP_DIR/.git" ]; then
    echo -e "${CYAN}Updating existing app repository...${RESET}"
    cd "$APP_DIR"
    git remote set-url origin "$APP_REPO_URL"
    git reset --hard origin/main
    git clean -fd
    git pull origin main
else
    echo -e "${CYAN}Cloning app repository into $APP_DIR...${RESET}"
    git clone "$APP_REPO_URL" "$APP_DIR"
fi

# --- Install npm dependencies ---
cd "$APP_DIR"
echo -e "${CYAN}Installing NPM packages...${RESET}"
npm install --silent
echo -e "${GREEN}✔ NPM packages installed.${RESET}"

# --- Create start.sh ---
echo -e "${CYAN}Creating start.sh...${RESET}"
cat > "$START_SCRIPT" <<EOF
#!/usr/bin/env bash
set -e

APP_DIR="\$(dirname "\${BASH_SOURCE[0]}")/../BetterSoundCloud-App"

cd "\$APP_DIR"

echo "🔄 Checking for updates..."
if git rev-parse --is-inside-work-tree &>/dev/null; then
    git fetch origin main
    LOCAL=\$(git rev-parse @)
    REMOTE=\$(git rev-parse @{u})
    if [ "\$LOCAL" != "\$REMOTE" ]; then
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
EOF

chmod +x "$START_SCRIPT"
echo -e "${GREEN}✔ start.sh created and made executable.${RESET}"

# --- Create .desktop entry ---
echo -e "${CYAN}Creating .desktop entry...${RESET}"
mkdir -p "$(dirname "$DESKTOP_FILE")"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=$APP_NAME
Exec=$START_SCRIPT
Icon=$ICON_PATH
Type=Application
Terminal=false
Categories=Audio;Music;
Comment=Enhanced SoundCloud desktop client
EOF
chmod +x "$DESKTOP_FILE"

# --- Notify user ---
echo -e "\n${GREEN}✔ Installation complete!${RESET}"
echo -e "You can start $APP_NAME from your application menu or by running:"
echo -e "  ${CYAN}$START_SCRIPT${RESET}"
echo -e "\nIt will automatically check for updates from ${APP_REPO_URL} every time it starts."
