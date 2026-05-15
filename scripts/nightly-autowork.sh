#!/usr/bin/env bash
set -euo pipefail
export TZ=Europe/Berlin

ROOT="${KEET_CLI_ROOT:-/openclaw/workspace/keet-cli}"
LOGDIR="${KEET_NIGHTLY_LOG_DIR:-/openclaw/workspace/logs}"
mkdir -p "$LOGDIR"
TODAY="$(date +%F)"
LOG="$LOGDIR/keet-cli-nightly-${TODAY}.log"
SUMMARY_FILE="${KEET_NIGHTLY_SUMMARY_FILE:-$LOGDIR/keet-cli-nightly-summary-${TODAY}.txt}"
LOCK="${KEET_NIGHTLY_LOCK:-/tmp/keet-cli-nightly-autowork.lock}"
HOUR="$(date +%H)"
HOUR_NUM=$((10#$HOUR))

if [ "$HOUR_NUM" -ge 6 ]; then
  echo "[$(date -Is)] outside allowed window, exiting" >> "$LOG"
  exit 0
fi

PROMPT_FILE="$(mktemp)"
cat > "$PROMPT_FILE" <<'PROMPT_EOF'
Nightly autonomous work window for Neo's keet-cli project.

Timebox: work only during 00:00–06:00 Europe/Berlin. Stop before the window ends and provide a concise German summary.

Project: /openclaw/workspace/keet-cli
Repo: github.com/projectreturn/Keet-cli

Goals: improve the project safely in small, useful increments. Prefer:
1) bridge status command
2) safe bridge config generator/init command
3) audio/Whisper cleanup and configuration improvements
4) TUI groundwork if smaller items are done

Rules:
- Defaults conservative/off by default.
- No auto-join, no auto-chat creation, no secret exposure.
- Keep Matrix/Neo live Keet rules intact.
- Run checks before done: npm run lint, skill validation if SKILL.md changes, and small CLI/import checks where relevant.
- Commit as projectreturn <projectreturn@users.noreply.github.com> and push to main only when changes are clean and tested.
- If blocked, document blocker and stop.

Do not send or deliver any message to Neo at night. Write a concise German summary to this file path instead: "$SUMMARY_FILE"

End with: changed, commit hash if pushed, tests run, next recommended task.
PROMPT_EOF

cleanup() { rm -f "$PROMPT_FILE"; }
trap cleanup EXIT

(
  flock -n 9 || { echo "[$(date -Is)] already running"; exit 0; }
  cd "$ROOT"
  git config user.name "projectreturn"
  git config user.email "projectreturn@users.noreply.github.com"
  echo "[$(date -Is)] nightly autowork start"
  export KEET_NIGHTLY_SUMMARY_FILE="$SUMMARY_FILE"
  openclaw agent --local --session-id keet-cli-nightly --message "$(cat "$PROMPT_FILE")" --timeout 21000 > "$SUMMARY_FILE.raw" 2>&1 || true
  cp "$SUMMARY_FILE.raw" "$SUMMARY_FILE" 2>/dev/null || true
  echo "[$(date -Is)] nightly autowork end; summary=$SUMMARY_FILE"
) 9>"$LOCK" >> "$LOG" 2>&1
