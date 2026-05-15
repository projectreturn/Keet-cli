#!/usr/bin/env node
import { inspectStorage } from './level-scan.js'
import { probeCore } from './core-probe.js'
import { probeSidecar } from './sidecar-probe.js'
import { listRooms, readMessages, sendMessage } from './keet-commands.js'
import { watchMessages } from './watch.js'
import { runDaemon } from './daemon.js'
import { runBridge } from './bridge.js'
import { runTui } from './tui.js'

const args = process.argv.slice(2)
const cmd = args[0] || 'help'

function help () {
  console.log(`keet-cli experimental commands

Usage:
  keet-cli help
  keet-cli inspect [--json]
  keet-cli core-probe [--json]
  keet-cli sidecar-probe [--json] [--live]
  keet-cli rooms [--json]
  keet-cli messages [--json] [--limit N] [--room ROOM_ID]
  keet-cli send [--room ROOM_ID] TEXT
  keet-cli watch [--room ROOM_ID] [--interval MS] [--include-local]
  keet-cli daemon [--interval MS] [--include-local]
  keet-cli tui
  keet-cli bridge [--interval MS] [--dry-run] [--once] [--replay] [--state FILE] [--config FILE]

Environment:
  KEET_APP_STORAGE   default: ~/.config/Keet/app-storage
  KEET_APP_PATH      default: ~/.local/opt/keet/squashfs-root/resources/app
`)
}

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  help()
} else if (cmd === 'core-probe') {
  const result = probeCore()
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Keet app path: ${result.appPath}`)
    console.log(`keet-core: ${result.corePackageExists ? result.version : 'missing'}`)
    console.log(`client file: ${result.clientFileExists ? 'found' : 'missing'}`)
    console.log('interesting client methods:')
    for (const m of result.interestingClientMethods) console.log(`- ${m}`)
  }
} else if (cmd === 'sidecar-probe') {
  const result = await probeSidecar({ live: args.includes('--live') })
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`worker: ${result.worker}`)
    console.log(`storage: ${result.runStorage}${result.live ? ' (live)' : ' (copy)'}`)
    for (const line of result.stdout.slice(-8)) console.log(`stdout: ${line}`)
    for (const line of result.stderr.slice(-8)) console.log(`stderr: ${line}`)
    for (const r of result.results) {
      if (r.ok) console.log(`${r.label}: ok ${JSON.stringify(r.value)?.slice(0, 500)}`)
      else console.log(`${r.label}: ${r.timeout ? 'timeout' : 'error'} ${r.error?.message || ''}`)
    }
  }
} else if (cmd === 'rooms') {
  const result = await listRooms()
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else for (const r of result) console.log(`${r.roomId}  ${r.title}  messages=${r.chatLength}  last=${r.lastText}`)
} else if (cmd === 'messages') {
  const limitIndex = args.indexOf('--limit')
  const roomIndex = args.indexOf('--room')
  const result = await readMessages({
    limit: limitIndex >= 0 ? Number(args[limitIndex + 1]) : 20,
    roomId: roomIndex >= 0 ? args[roomIndex + 1] : null
  })
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`# ${result.title} (${result.roomId})`)
    for (const m of result.messages.slice().reverse()) console.log(`${new Date(m.timestamp).toISOString()} ${m.sender}: ${m.text}`)
  }
} else if (cmd === 'send') {
  const roomIndex = args.indexOf('--room')
  const roomId = roomIndex >= 0 ? args[roomIndex + 1] : null
  const textArgs = args.slice(1).filter((v, i, arr) => {
    if (v === '--room') return false
    if (arr[i - 1] === '--room') return false
    return true
  })
  const result = await sendMessage({ roomId, text: textArgs.join(' ') })
  console.log(`sent to ${result.title}: ${result.text}`)
} else if (cmd === 'watch') {
  const roomIndex = args.indexOf('--room')
  const intervalIndex = args.indexOf('--interval')
  const roomId = roomIndex >= 0 ? args[roomIndex + 1] : null
  const interval = intervalIndex >= 0 ? Number(args[intervalIndex + 1]) : 5000
  console.error(`watching Keet${roomId ? ` room ${roomId}` : ''} every ${interval}ms`)
  await watchMessages({
    roomId,
    interval,
    includeLocal: args.includes('--include-local'),
    onMessage (message, room) {
      console.log(JSON.stringify({ room, message }))
    }
  })
} else if (cmd === 'daemon') {
  const intervalIndex = args.indexOf('--interval')
  await runDaemon({
    interval: intervalIndex >= 0 ? Number(args[intervalIndex + 1]) : 3000,
    includeLocal: args.includes('--include-local')
  })
} else if (cmd === 'tui') {
  await runTui()
} else if (cmd === 'bridge') {
  const intervalIndex = args.indexOf('--interval')
  const stateIndex = args.indexOf('--state')
  const configIndex = args.indexOf('--config')
  await runBridge({
    interval: intervalIndex >= 0 ? Number(args[intervalIndex + 1]) : 3000,
    dryRun: args.includes('--dry-run'),
    once: args.includes('--once'),
    replay: args.includes('--replay'),
    stateFile: stateIndex >= 0 ? args[stateIndex + 1] : '.keet-bridge-state.json',
    configFile: configIndex >= 0 ? args[configIndex + 1] : null
  })
} else if (cmd === 'inspect') {
  const result = inspectStorage()
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Keet app storage: ${result.storagePath}`)
    console.log(`exists: ${result.exists}`)
    console.log(`profiles: ${result.profiles.length}`)
    for (const p of result.profiles) console.log(`- profile ${p.id ?? '?'}: ${p.name ?? '(unnamed)'}`)
    console.log(`preferences: ${result.preferencesPathExists ? 'found' : 'missing'}`)
    console.log(`db files: ${result.dbFiles.length}`)
    for (const f of result.dbFiles.slice(-12)) console.log(`- ${f.name} ${f.size} bytes`)
    if (result.messageFragments.length) {
      console.log('\nPossible message fragments (diagnostic, not stable API):')
      for (const m of result.messageFragments.slice(-20)) console.log(`- ${m}`)
    }
  }
} else {
  console.error(`Unknown command: ${cmd}`)
  help()
  process.exit(1)
}
