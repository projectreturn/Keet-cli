#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${KEET_BRIDGE_STATE:-$ROOT/.keet-bridge-state.json}"
INTERVAL="${KEET_BRIDGE_INTERVAL:-3000}"
RESTART_DELAY="${KEET_BRIDGE_RESTART_DELAY:-5}"
LOG_FILE="${KEET_BRIDGE_LOG:-$ROOT/keet-bridge.log}"

cd "$ROOT"

echo "[$(date -Is)] keet bridge supervisor starting" >> "$LOG_FILE"

while true; do
  echo "[$(date -Is)] starting bridge interval=$INTERVAL state=$STATE_FILE" >> "$LOG_FILE"
  node src/cli.js bridge --interval "$INTERVAL" --state "$STATE_FILE" >> "$LOG_FILE" 2>&1
  code=$?
  echo "[$(date -Is)] bridge exited code=$code; restarting in ${RESTART_DELAY}s" >> "$LOG_FILE"
  sleep "$RESTART_DELAY"
done
