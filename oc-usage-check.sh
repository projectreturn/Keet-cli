#!/usr/bin/env bash
set -euo pipefail
json=$(openclaw status --usage --json 2>/dev/null)
tmp=$(mktemp)
printf '%s' "$json" > "$tmp"
node - "$tmp" <<'NODE'
const fs = require('fs')
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const session = data.sessions?.recent?.[0]
const provider = data.usage?.providers?.find(p => p.provider === 'openai-codex')
const five = provider?.windows?.find(w => w.label === '5h')
const week = provider?.windows?.find(w => /week/i.test(w.label))
function fmt(ts) { return ts ? new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : 'unknown' }
console.log(`model=${session?.model || 'unknown'}`)
console.log(`context=${session?.totalTokens || '?'} / ${session?.contextTokens || '?'} (${session?.percentUsed ?? '?'}% used, remaining=${session?.remainingTokens ?? '?'})`)
if (five) console.log(`codex_5h=${five.usedPercent}% used, resets=${fmt(five.resetAt)}`)
if (week) console.log(`codex_week=${week.usedPercent}% used, resets=${fmt(week.resetAt)}`)
if (five && five.usedPercent >= 95) {
  console.log('WAIT: 5h Codex window nearly exhausted')
  process.exit(2)
}
if (session && session.percentUsed >= 85) {
  console.log('WARN: context is getting high; summarize/commit before continuing')
  process.exit(1)
}
NODE
rm -f "$tmp"
