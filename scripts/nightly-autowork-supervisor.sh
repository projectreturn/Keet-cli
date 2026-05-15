#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${KEET_NIGHTLY_LOG:-$ROOT/keet-nightly.log}"
INTERVAL_SECONDS="${KEET_NIGHTLY_CHECK_INTERVAL:-300}"
RUN_HOUR="${KEET_NIGHTLY_RUN_HOUR:-00}"
RUN_MINUTE="${KEET_NIGHTLY_RUN_MINUTE:-05}"
SUMMARY_HOUR="${KEET_NIGHTLY_SUMMARY_HOUR:-09}"
SUMMARY_MINUTE="${KEET_NIGHTLY_SUMMARY_MINUTE:-00}"
STAMP_FILE="${KEET_NIGHTLY_STAMP:-$ROOT/.keet-nightly-last-run}"
SUMMARY_STAMP_FILE="${KEET_NIGHTLY_SUMMARY_STAMP:-$ROOT/.keet-nightly-last-summary}"

cd "$ROOT"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Is)] nightly supervisor starting" >> "$LOG_FILE"

while true; do
  now_hm="$(TZ=Europe/Berlin date +%H:%M)"
  today="$(TZ=Europe/Berlin date +%F)"
  target="${RUN_HOUR}:${RUN_MINUTE}"
  last="$(cat "$STAMP_FILE" 2>/dev/null || true)"
  last_summary="$(cat "$SUMMARY_STAMP_FILE" 2>/dev/null || true)"

  summary_target="${SUMMARY_HOUR}:${SUMMARY_MINUTE}"

  if [[ "$now_hm" > "$summary_target" || "$now_hm" == "$summary_target" ]]; then
    if [[ "$last_summary" != "$today" ]]; then
      summary_file="/openclaw/workspace/logs/keet-cli-nightly-summary-${today}.txt"
      if [[ -s "$summary_file" ]]; then
        echo "$today" > "$SUMMARY_STAMP_FILE"
        echo "[$(date -Is)] sending 09:00 nightly summary" >> "$LOG_FILE"
        openclaw agent --local --session-id keet-neo --message "Nachtarbeits-Zusammenfassung für Neo. Fasse kurz auf Deutsch zusammen, was nachts am keet-cli Projekt erledigt wurde. Nutze diese Rohdaten:

$(tail -c 12000 "$summary_file")" --deliver --timeout 600 >> "$LOG_FILE" 2>&1 || true
      fi
    fi
  fi

  if [[ "$now_hm" > "$target" || "$now_hm" == "$target" ]]; then
    hour="${now_hm%%:*}"
    if [[ "$hour" == 0* || "$hour" == 1 || "$hour" == 2 || "$hour" == 3 || "$hour" == 4 || "$hour" == 5 ]]; then
      if [[ "$last" != "$today" ]]; then
        echo "$today" > "$STAMP_FILE"
        echo "[$(date -Is)] launching nightly autowork" >> "$LOG_FILE"
        "$ROOT/scripts/nightly-autowork.sh" >> "$LOG_FILE" 2>&1 || true
        echo "[$(date -Is)] nightly autowork returned" >> "$LOG_FILE"
      fi
    fi
  fi

  sleep "$INTERVAL_SECONDS"
done
