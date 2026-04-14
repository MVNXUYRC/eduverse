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
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ead}"
DB_USER="${DB_USER:-ead_user}"
AUTO_START_DB="${AUTO_START_DB:-true}"
PG_DOCKER_CONTAINER="${PG_DOCKER_CONTAINER:-ead-postgres}"
PERSISTENCE_MODE="${PERSISTENCE_MODE:-auto}"

HAS_PG_CONFIG="false"
if [[ -n "${DATABASE_URL:-}" || ( -n "${DB_HOST:-}" && -n "${DB_NAME:-}" && -n "${DB_USER:-}" ) ]]; then
  HAS_PG_CONFIG="true"
fi

USE_POSTGRES="false"
case "$PERSISTENCE_MODE" in
  postgres|postgresql)
    USE_POSTGRES="true"
    ;;
  json)
    USE_POSTGRES="false"
    ;;
  auto)
    if [[ "$HAS_PG_CONFIG" == "true" ]]; then
      USE_POSTGRES="true"
    fi
    ;;
  *)
    echo "Modo de persistencia inválido: $PERSISTENCE_MODE"
    echo "Usá PERSISTENCE_MODE=auto|json|postgres"
    exit 1
    ;;
esac

if [[ "$USE_POSTGRES" == "true" && "$HAS_PG_CONFIG" != "true" ]]; then
  echo "Error: PERSISTENCE_MODE=$PERSISTENCE_MODE requiere configuración PostgreSQL."
  echo "Definí DATABASE_URL o DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD en .env.local o .env."
  exit 1
fi

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

maybe_start_postgres_container() {
  if [[ "$USE_POSTGRES" != "true" ]]; then
    return
  fi

  if [[ "$AUTO_START_DB" != "true" ]]; then
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Aviso: docker no está instalado; omito autoarranque de PostgreSQL."
    return
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Aviso: docker no está disponible para el usuario actual; omito autoarranque de PostgreSQL."
    return
  fi

  if docker ps --format '{{.Names}}' | grep -Fxq "$PG_DOCKER_CONTAINER"; then
    echo "PostgreSQL ($PG_DOCKER_CONTAINER) ya está en ejecución."
    return
  fi

  if docker ps -a --format '{{.Names}}' | grep -Fxq "$PG_DOCKER_CONTAINER"; then
    echo "Iniciando PostgreSQL ($PG_DOCKER_CONTAINER)..."
    docker start "$PG_DOCKER_CONTAINER" >/dev/null
  else
    echo "Aviso: no existe contenedor '$PG_DOCKER_CONTAINER'."
    echo "Crealo o definí PG_DOCKER_CONTAINER/AUTO_START_DB en .env.local."
  fi
}

wait_for_postgres() {
  if [[ "$USE_POSTGRES" != "true" ]]; then
    return
  fi

  if [[ "$AUTO_START_DB" != "true" ]]; then
    return
  fi

  if ! command -v pg_isready >/dev/null 2>&1; then
    return
  fi

  local retries=25
  local i
  for i in $(seq 1 "$retries"); do
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      echo "PostgreSQL disponible en $DB_HOST:$DB_PORT."
      return
    fi
    sleep 1
  done

  echo "Aviso: PostgreSQL no respondió a tiempo en $DB_HOST:$DB_PORT."
}

maybe_start_postgres_container
wait_for_postgres

if [[ "$USE_POSTGRES" == "true" ]]; then
  echo "Persistencia: PostgreSQL"
else
  echo "Persistencia: JSON (${JSON_DB_PATH:-backend/data/db.json})"
fi

case "$MODE" in
  dev)
    START_CMD="exec node backend/server-standalone.js"
    ;;
  prod|start)
    START_CMD="exec node backend/server-standalone.js"
    ;;
  watch)
    START_CMD="exec node --watch backend/server-standalone.js"
    ;;
  *)
    echo "Modo inválido: $MODE"
    echo "Uso: ./scripts/ead-up.sh [dev|watch|prod]"
    exit 1
    ;;
esac

if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$PORT )" | grep -q ":$PORT"; then
  echo "Error: el puerto $PORT ya está en uso."
  echo "Liberalo o cambiá PORT en .env.local/.env antes de iniciar."
  exit 1
fi

start_detached() {
  if [[ -n "$ENV_FILE" ]]; then
    nohup setsid bash -lc "cd '$ROOT_DIR'; set -a; . '$ENV_FILE'; set +a; $START_CMD" </dev/null >> "$LOG_FILE" 2>&1 &
  else
    nohup setsid bash -lc "cd '$ROOT_DIR'; $START_CMD" </dev/null >> "$LOG_FILE" 2>&1 &
  fi
  echo $!
}

wait_for_health() {
  local pid="$1"
  local retries=30
  local i
  for i in $(seq 1 "$retries"); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 1
    fi
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
        return 0
      fi
    else
      sleep 1
      return 0
    fi
    sleep 1
  done
  return 1
}

echo "Iniciando proyecto en modo '$MODE'..."
if [[ "$MODE" == "watch" ]]; then
  echo "Aviso: 'watch' reinicia el proceso automáticamente y no es el modo recomendado para dejarlo corriendo como servicio."
fi

PID="$(start_detached)"
echo "$PID" > "$PID_FILE"

if wait_for_health "$PID"; then
  echo "Proyecto levantado correctamente (PID: $PID)."
  echo "URL: http://localhost:$PORT"
  echo "Logs: $LOG_FILE"
else
  echo "No se pudo iniciar el proyecto. Revisá logs en: $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
