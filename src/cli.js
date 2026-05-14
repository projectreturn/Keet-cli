#!/usr/bin/env node
import { inspectStorage } from './level-scan.js'
import { probeCore } from './core-probe.js'

const args = process.argv.slice(2)
const cmd = args[0] || 'help'

function help () {
  console.log(`keet-cli experimental commands

Usage:
  keet-cli help
  keet-cli inspect [--json]
  keet-cli core-probe [--json]

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
