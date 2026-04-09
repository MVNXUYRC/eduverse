#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTOSTART_DIR="$HOME/.config/autostart"
LAUNCHER_DIR="$HOME/.local/bin"
LAUNCHER="$LAUNCHER_DIR/ead-startup"
DESKTOP_FILE="$AUTOSTART_DIR/ead-project.desktop"

mkdir -p "$AUTOSTART_DIR" "$LAUNCHER_DIR"

cat > "$LAUNCHER" <<SCRIPT
#!/usr/bin/env bash
cd "$ROOT_DIR"
"$ROOT_DIR/scripts/ead-up.sh" start
SCRIPT

chmod +x "$LAUNCHER"

cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=EAD Project Autostart
Comment=Inicia el proyecto EAD al iniciar sesion
Exec=$LAUNCHER
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP

echo "Autoarranque instalado."
echo "Launcher: $LAUNCHER"
echo "Desktop entry: $DESKTOP_FILE"
echo "Reiniciá sesión para probarlo."
