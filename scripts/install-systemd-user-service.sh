#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SYSTEMD_DIR/ead-project.service"
ENV_FILE=""

for candidate in "$ROOT_DIR/.env.local" "$ROOT_DIR/.env"; do
  if [[ -f "$candidate" ]]; then
    ENV_FILE="$candidate"
    break
  fi
done

mkdir -p "$SYSTEMD_DIR"

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=EAD Project Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=/bin/bash -lc 'set -a; if [[ -f "$ENV_FILE" ]]; then . "$ENV_FILE"; fi; set +a; exec node backend/server-standalone.js'
Restart=on-failure
RestartSec=3
KillMode=control-group

[Install]
WantedBy=default.target
SERVICE

echo "Servicio systemd de usuario instalado en:"
echo "  $SERVICE_FILE"
echo
echo "Para activarlo ahora:"
echo "  systemctl --user daemon-reload"
echo "  systemctl --user enable --now ead-project.service"
echo
echo "Para ver estado:"
echo "  systemctl --user status ead-project.service"
echo
echo "Para ver logs:"
echo "  journalctl --user -u ead-project.service -f"
