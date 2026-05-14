import fs from 'node:fs'
import path from 'node:path'
import { defaultKeetAppPath } from './paths.js'

export function probeCore () {
  const appPath = defaultKeetAppPath()
  const corePkg = path.join(appPath, 'node_modules', '@holepunchto', 'keet-core', 'package.json')
  const clientFile = path.join(appPath, 'node_modules', '@holepunchto', 'keet-core', 'lib', 'client', 'index.js')
  const pkg = fs.existsSync(corePkg) ? JSON.parse(fs.readFileSync(corePkg, 'utf8')) : null
  const clientSource = fs.existsSync(clientFile) ? fs.readFileSync(clientFile, 'utf8') : ''
  const methods = [...clientSource.matchAll(/(?:async\s+)?([a-zA-Z][a-zA-Z0-9_]*)\([^)]*\)\{/g)]
    .map(m => m[1])
    .filter(name => /^(view|add|create|accept|reject|start|stop|update|leave|activate|deactivate|boot)/.test(name))

  return {
    appPath,
    corePackageExists: fs.existsSync(corePkg),
    version: pkg?.version || null,
    exports: pkg?.exports || null,
    clientFileExists: fs.existsSync(clientFile),
    interestingClientMethods: [...new Set(methods)].sort()
  }
}
