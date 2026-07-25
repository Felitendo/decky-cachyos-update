#!/bin/sh
# CachyOS Update - Decky plugin installer
#
#   curl -sSL https://raw.githubusercontent.com/Felitendo/decky-cachyos-update/main/install.sh | sh
#
# Options (append after `| sh -s --`):
#   --no-deps    do not install missing dependencies
#   --yes        never ask, assume yes
set -eu

REPO="Felitendo/decky-cachyos-update"
PLUGIN_DIR_NAME="CachyOSUpdate"
HOMEBREW_DIR="${DECKY_HOME:-$HOME/homebrew}"
PLUGINS_DIR="$HOMEBREW_DIR/plugins"
TARGET="$PLUGINS_DIR/$PLUGIN_DIR_NAME"

SKIP_DEPS=0
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        --no-deps) SKIP_DEPS=1 ;;
        --yes|-y)  ASSUME_YES=1 ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

# --- localization ---------------------------------------------------------
# Follows the system locale, same as the plugin UI itself.

case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
    de*) LOCALE=de ;;
    *)   LOCALE=en ;;
esac

msg() {
    if [ "$LOCALE" = de ]; then
        case "$1" in
            run_as_root)  echo "Bitte NICHT als root ausführen - das Skript fragt selbst per sudo nach." ;;
            no_pacman)    echo "Kein pacman gefunden. Dieses Plugin ist für CachyOS / Arch." ;;
            no_curl)      echo "curl wird benötigt." ;;
            no_decky)     echo "Decky Loader wurde nicht gefunden ($PLUGINS_DIR fehlt).
   Bitte zuerst Decky installieren: https://github.com/SteamDeckHomebrew/decky-loader" ;;
            missing)      echo "Es fehlen Pakete:$2" ;;
            install_q)    echo "Jetzt mit pacman installieren?" ;;
            deps_failed)  echo "Installation der Abhängigkeiten fehlgeschlagen." ;;
            deps_skipped) echo "Übersprungen. Ohne diese Pakete sind AUR- und Update-Prüfung eingeschränkt." ;;
            searching)    echo "Suche neueste Version…" ;;
            no_release)   echo "Kein Release-Archiv gefunden. Gibt es unter https://github.com/$REPO/releases schon ein Release?" ;;
            downloading)  echo "Lade $2" ;;
            dl_failed)    echo "Download fehlgeschlagen." ;;
            no_extract)   echo "Weder bsdtar noch unzip gefunden." ;;
            bad_archive)  echo "Archiv hat ein unerwartetes Format." ;;
            missing_file) echo "$2 fehlt im Archiv." ;;
            installing)   echo "Installiere nach $2" ;;
            restarting)   echo "Starte Decky neu…" ;;
            restart_fail) echo "plugin_loader konnte nicht neu gestartet werden - bitte das Gerät neu starten." ;;
            done_title)   echo "Fertig." ;;
            done_where)   echo "Das Plugin findest du im Gamemode unter der Decky-Schaltfläche
  als \"CachyOS Update\"." ;;
            done_test)    echo "Beim ersten Öffnen empfiehlt sich der Selbsttest unter Einstellungen -
  dort muss \"Läuft als root\" stehen." ;;
        esac
    else
        case "$1" in
            run_as_root)  echo "Do NOT run this as root - the script asks for sudo itself." ;;
            no_pacman)    echo "No pacman found. This plugin is for CachyOS / Arch." ;;
            no_curl)      echo "curl is required." ;;
            no_decky)     echo "Decky Loader not found ($PLUGINS_DIR is missing).
   Please install Decky first: https://github.com/SteamDeckHomebrew/decky-loader" ;;
            missing)      echo "Missing packages:$2" ;;
            install_q)    echo "Install them with pacman now?" ;;
            deps_failed)  echo "Installing dependencies failed." ;;
            deps_skipped) echo "Skipped. Without these packages AUR and update checking are limited." ;;
            searching)    echo "Looking for the latest release…" ;;
            no_release)   echo "No release archive found. Is there a release at https://github.com/$REPO/releases yet?" ;;
            downloading)  echo "Downloading $2" ;;
            dl_failed)    echo "Download failed." ;;
            no_extract)   echo "Neither bsdtar nor unzip found." ;;
            bad_archive)  echo "Archive has an unexpected layout." ;;
            missing_file) echo "$2 is missing from the archive." ;;
            installing)   echo "Installing to $2" ;;
            restarting)   echo "Restarting Decky…" ;;
            restart_fail) echo "Could not restart plugin_loader - please reboot the device." ;;
            done_title)   echo "Done." ;;
            done_where)   echo "You will find the plugin in gamemode under the Decky button
  as \"CachyOS Update\"." ;;
            done_test)    echo "On first open, run the self-test under Settings -
  it has to say \"Running as root\"." ;;
        esac
    fi
}

info() { printf '\033[1;36m::\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m::\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31m::\033[0m %s\n' "$1" >&2; exit 1; }

# Reads from the terminal, not stdin - stdin is the script itself when this is
# run as `curl ... | sh`.
confirm() {
    [ "$ASSUME_YES" -eq 1 ] && return 0
    [ -e /dev/tty ] || return 0
    printf '\033[1;36m::\033[0m %s [Y/n] ' "$1" > /dev/tty
    read -r reply < /dev/tty || return 0
    case "$reply" in
        [nN]*) return 1 ;;
        *)     return 0 ;;
    esac
}

# --- sanity checks --------------------------------------------------------

[ "$(id -u)" -ne 0 ] || die "$(msg run_as_root)"

command -v pacman >/dev/null 2>&1 || die "$(msg no_pacman)"
command -v curl   >/dev/null 2>&1 || die "$(msg no_curl)"

[ -d "$PLUGINS_DIR" ] || die "$(msg no_decky)"

# --- dependencies ---------------------------------------------------------

if [ "$SKIP_DEPS" -eq 0 ]; then
    MISSING=""
    # yay: the only AUR helper that works from a root process. paru refuses.
    # pacman-contrib: checkupdates + pacdiff. fakeroot: checkupdates needs it.
    for pkg in yay pacman-contrib fakeroot; do
        pacman -Qq "$pkg" >/dev/null 2>&1 || MISSING="$MISSING $pkg"
    done
    if [ -n "$MISSING" ]; then
        warn "$(msg missing "$MISSING")"
        if confirm "$(msg install_q)"; then
            # shellcheck disable=SC2086
            sudo pacman -S --needed --noconfirm $MISSING || die "$(msg deps_failed)"
        else
            warn "$(msg deps_skipped)"
        fi
    fi
fi

# --- download -------------------------------------------------------------

info "$(msg searching)"
API="https://api.github.com/repos/$REPO/releases/latest"
URL=$(curl -sSL "$API" \
    | grep -o '"browser_download_url": *"[^"]*\.zip"' \
    | head -n 1 \
    | sed 's/.*"\(https[^"]*\)"/\1/')

[ -n "$URL" ] || die "$(msg no_release)"

TMP=$(mktemp -d)
# shellcheck disable=SC2064
trap "rm -rf '$TMP'" EXIT INT TERM

info "$(msg downloading "$URL")"
curl -sSL -o "$TMP/plugin.zip" "$URL" || die "$(msg dl_failed)"

if command -v bsdtar >/dev/null 2>&1; then
    bsdtar -xf "$TMP/plugin.zip" -C "$TMP"
elif command -v unzip >/dev/null 2>&1; then
    unzip -q "$TMP/plugin.zip" -d "$TMP"
else
    die "$(msg no_extract)"
fi

# The archive contains one top-level directory.
SRC=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n 1)
[ -n "$SRC" ] || die "$(msg bad_archive)"
for f in plugin.json main.py dist/index.js; do
    [ -f "$SRC/$f" ] || die "$(msg missing_file "$f")"
done

# --- install --------------------------------------------------------------

info "$(msg installing "$TARGET")"
sudo rm -rf "$TARGET"
sudo mkdir -p "$TARGET"
sudo cp -r "$SRC/." "$TARGET/"

# Same ownership Decky applies to a root plugin itself (browser.py:
# set_plugin_dir_permissions).
sudo chown -R root:root "$TARGET"
sudo chmod -R 755 "$TARGET"

info "$(msg restarting)"
sudo systemctl restart plugin_loader 2>/dev/null || warn "$(msg restart_fail)"

cat <<EOF

  $(msg done_title)

  $(msg done_where)

  $(msg done_test)

  Logs: $HOMEBREW_DIR/logs/$PLUGIN_DIR_NAME/plugin.log

EOF
