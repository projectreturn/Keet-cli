#!/usr/bin/env bash
set -u

ROOT="${KEET_CLI_ROOT:-/root/.openclaw/workspace/keet-cli}"
LOG_DIR="${KEET_CLI_LOG_DIR:-$ROOT}"
GATEWAY_WATCHDOG_LOG="${OPENCLAW_GATEWAY_WATCHDOG_LOG:-$LOG_DIR/openclaw-gateway-watchdog.log}"
BRIDGE_LOG="${KEET_BRIDGE_LOG:-$LOG_DIR/keet-bridge.log}"
NIGHTLY_LOG="${KEET_NIGHTLY_LOG:-$LOG_DIR/keet-nightly.log}"

cd "$ROOT"

echo "[$(date -Is)] container-entrypoint starting" | tee -a "$LOG_DIR/container-entrypoint.log"

# Start/repair OpenClaw Gateway in the background. The watchdog keeps trying.
OPENCLAW_GATEWAY_WATCHDOG_LOG="$GATEWAY_WATCHDOG_LOG" \
  "$ROOT/scripts/openclaw-gateway-watchdog.sh" &
GW_PID=$!

# Start Keet <-> OpenClaw bridge under a restart loop.
KEET_BRIDGE_LOG="$BRIDGE_LOG" \
  "$ROOT/scripts/keet-bridge-supervisor.sh" &
BRIDGE_PID=$!

# Start nightly autonomous project work scheduler.
KEET_NIGHTLY_LOG="$NIGHTLY_LOG" \
  "$ROOT/scripts/nightly-autowork-supervisor.sh" &
NIGHTLY_PID=$!

shutdown() {
  echo "[$(date -Is)] container-entrypoint stopping" | tee -a "$LOG_DIR/container-entrypoint.log"
  kill "$GW_PID" "$BRIDGE_PID" "$NIGHTLY_PID" 2>/dev/null || true
  wait "$GW_PID" "$BRIDGE_PID" "$NIGHTLY_PID" 2>/dev/null || true
}
trap shutdown INT TERM

# Keep PID1 alive and surface logs for `docker logs`.
touch "$GATEWAY_WATCHDOG_LOG" "$BRIDGE_LOG" "$NIGHTLY_LOG"
tail -n 0 -F "$GATEWAY_WATCHDOG_LOG" "$BRIDGE_LOG" "$NIGHTLY_LOG" &
TAIL_PID=$!
wait "$TAIL_PID"
