#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/ead.pid"
LOG_FILE="$RUN_DIR/ead.log"
MODE="${1:-dev}"

mkdir -p "$RUN_DIR"

ENV_FILE=""
for candidate in "$ROOT_DIR/.env.local" "$ROOT_DIR/.env"; do
  if [[ -f "$candidate" ]]; then
    ENV_FILE="$candidate"
    break
  fi
done

if [[ -n "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PORT="${PORT:-3000}"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js no está instalado o no está en PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm no está instalado o no está en PATH."
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if [[ -n "$PID" ]] && kill -0 "$PID" >/dev/null 2>&1; then
    echo "El proyecto ya está en ejecución (PID: $PID)."
    echo "URL: http://localhost:$PORT"
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "Instalando dependencias..."
  npm install
fi

case "$MODE" in
  dev)
    START_CMD="exec node --watch backend/server-standalone.js"
    ;;
  prod|start)
    START_CMD="exec node backend/server-standalone.js"
    ;;
  *)
    echo "Modo inválido: $MODE"
    echo "Uso: ./scripts/ead-up.sh [dev|prod]"
    exit 1
    ;;
esac

echo "Iniciando proyecto en modo '$MODE'..."
if [[ -n "$ENV_FILE" ]]; then
  nohup bash -lc "set -a; . '$ENV_FILE'; set +a; $START_CMD" >> "$LOG_FILE" 2>&1 &
else
  nohup bash -lc "$START_CMD" >> "$LOG_FILE" 2>&1 &
fi
PID=$!
echo "$PID" > "$PID_FILE"

sleep 2
if kill -0 "$PID" >/dev/null 2>&1; then
  echo "Proyecto levantado correctamente (PID: $PID)."
  echo "URL: http://localhost:$PORT"
  echo "Logs: $LOG_FILE"
else
  echo "No se pudo iniciar el proyecto. Revisá logs en: $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
