#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.run/ead.pid"
LOG_FILE="$ROOT_DIR/.run/ead.log"

for candidate in "$ROOT_DIR/.env.local" "$ROOT_DIR/.env"; do
  if [[ -f "$candidate" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$candidate"
    set +a
    break
  fi
done

PORT="${PORT:-3000}"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if [[ -n "$PID" ]] && kill -0 "$PID" >/dev/null 2>&1; then
    echo "Estado: en ejecución"
    echo "PID: $PID"
    echo "URL: http://localhost:$PORT"
    echo "Log: $LOG_FILE"
    exit 0
  fi
fi

echo "Estado: detenido"
if [[ -f "$LOG_FILE" ]]; then
  echo "Últimas líneas de log:"
  tail -n 20 "$LOG_FILE" || true
fi
