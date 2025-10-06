#!/usr/bin/env bash
set -e

APP_NAME="BetterSoundCloud"
INSTALL_DIR="$HOME/BetterSoundCloud-Linux"
APP_REPO_URL="https://github.com/ULTRA-VAGUE/BetterSoundCloud-On-Linux"
START_SCRIPT="$INSTALL_DIR/start.sh"
DESKTOP_FILE="$HOME/.local/share/applications/$APP_NAME.desktop"

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

# --- Clone or update repo ---
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${CYAN}Updating existing repository...${RESET}"
    cd "$INSTALL_DIR"
    git reset --hard origin/main
    git clean -fd
    git pull origin main
else
    echo -e "${CYAN}Cloning repository into $INSTALL_DIR...${RESET}"
    git clone "$APP_REPO_URL" "$INSTALL_DIR"
fi

# --- Install npm dependencies ---
cd "$INSTALL_DIR"
echo -e "${CYAN}Installing NPM packages...${RESET}"
npm install --silent
echo -e "${GREEN}✔ NPM packages installed.${RESET}"

# --- Create start.sh ---
echo -e "${CYAN}Creating start.sh...${RESET}"
cat > "$START_SCRIPT" <<EOF
#!/usr/bin/env bash
set -e

cd "\$(dirname "\${BASH_SOURCE[0]}")"

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
Icon=$INSTALL_DIR/app/lib/assets/icon.ico
Type=Application
Terminal=false
Categories=Audio;Music;
Comment=Enhanced SoundCloud desktop client
EOF
chmod +x "$DESKTOP_FILE"
echo -e "${GREEN}✔ .desktop entry created.${RESET}"

# --- Done ---
echo -e "\n${GREEN}✔ Installation complete!${RESET}"
echo -e "You can start $APP_NAME from your application menu or by running:"
echo -e "  ${CYAN}$START_SCRIPT${RESET}"
