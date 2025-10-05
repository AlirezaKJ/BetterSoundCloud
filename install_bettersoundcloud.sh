#!/usr/bin/env bash
set -e

APP_NAME="BetterSoundCloud"
REPO_URL="https://github.com/AlirezaKJ/BetterSoundCloud"
INSTALL_DIR="$HOME/$APP_NAME"
ICON_PATH="$INSTALL_DIR/app/lib/assets/icon.ico"
DESKTOP_FILE="$HOME/.local/share/applications/$APP_NAME.desktop"
START_SCRIPT="$INSTALL_DIR/start.sh"

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

# --- Install prerequisites automatically ---
echo -e "${CYAN}Installing dependencies (git, nodejs, npm)...${RESET}"
case "$PM" in
    apt)
        $INSTALL_CMD git curl nodejs npm || {
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt install -y nodejs git
        }
        ;;
    pacman)
        $INSTALL_CMD git nodejs npm
        ;;
    dnf)
        $INSTALL_CMD git nodejs npm
        ;;
    zypper)
        $INSTALL_CMD git nodejs npm
        ;;
esac
echo -e "${GREEN}✔ Dependencies installed.${RESET}\n"

# --- Clone or update repo ---
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${CYAN}Updating existing repository...${RESET}"
    cd "$INSTALL_DIR"
    # Automatically handle uncommitted changes
    git reset --hard HEAD
    git clean -fd
    git pull --rebase || git pull
else
    echo -e "${CYAN}Cloning repository into $INSTALL_DIR...${RESET}"
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

# --- Install npm dependencies ---
cd "$INSTALL_DIR"
echo -e "${CYAN}Installing NPM packages...${RESET}"
npm install --silent
echo -e "${GREEN}✔ NPM packages installed.${RESET}"

# --- Create auto-update launcher ---
cat > "$START_SCRIPT" <<EOF
#!/usr/bin/env bash
set -e
cd "$INSTALL_DIR"
echo "Checking for updates..."
git fetch origin
git reset --hard origin/main
git clean -fd
echo "Starting BetterSoundCloud..."
npm start
EOF
chmod +x "$START_SCRIPT"

# --- Create .desktop entry ---
mkdir -p "$(dirname "$DESKTOP_FILE")"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=BetterSoundCloud
Exec=$START_SCRIPT
Icon=$ICON_PATH
Type=Application
Terminal=false
Categories=Audio;Music;
Comment=Enhanced SoundCloud Client
EOF
chmod +x "$DESKTOP_FILE"

# --- Notify user ---
echo -e "\n${GREEN}✔ Installation complete!${RESET}"
echo -e "You can start BetterSoundCloud via your application menu or by running:"
echo -e "  ${CYAN}$START_SCRIPT${RESET}"
echo -e "\nIt will automatically update cleanly on every start."
