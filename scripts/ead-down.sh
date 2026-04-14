#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.run/ead.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No hay PID guardado. El proyecto parece no estar en ejecución."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if [[ -z "$PID" ]]; then
  echo "PID inválido. Limpiando archivo de PID."
  rm -f "$PID_FILE"
  exit 0
fi

if kill -0 "$PID" >/dev/null 2>&1; then
  echo "Deteniendo proyecto (PID: $PID)..."
  PGID="$(ps -o pgid= -p "$PID" 2>/dev/null | tr -d '[:space:]')"
  if [[ -n "$PGID" && "$PGID" =~ ^[0-9]+$ ]]; then
    kill -- "-$PGID" >/dev/null 2>&1 || kill "$PID"
  else
    kill "$PID"
  fi

  for _ in {1..20}; do
    if ! kill -0 "$PID" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done

  if kill -0 "$PID" >/dev/null 2>&1; then
    echo "Forzando cierre (SIGKILL)..."
    if [[ -n "${PGID:-}" && "$PGID" =~ ^[0-9]+$ ]]; then
      kill -9 -- "-$PGID" >/dev/null 2>&1 || kill -9 "$PID"
    else
      kill -9 "$PID"
    fi
  fi

  echo "Proyecto detenido."
else
  echo "El proceso PID $PID no está activo."
fi

rm -f "$PID_FILE"
