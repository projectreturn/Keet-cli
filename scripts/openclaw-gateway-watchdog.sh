#!/usr/bin/env bash
set -u

LOG_FILE="${OPENCLAW_GATEWAY_WATCHDOG_LOG:-/root/.openclaw/workspace/keet-cli/openclaw-gateway-watchdog.log}"
SLEEP_SECONDS="${OPENCLAW_GATEWAY_WATCHDOG_INTERVAL:-30}"

while true; do
  if ! openclaw health >/dev/null 2>&1; then
    echo "[$(date -Is)] gateway health failed; attempting openclaw gateway restart" >> "$LOG_FILE"
    openclaw gateway restart >> "$LOG_FILE" 2>&1 || true
  fi
  sleep "$SLEEP_SECONDS"
done
