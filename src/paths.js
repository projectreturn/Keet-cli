import os from 'node:os'
import path from 'node:path'

export function expandHome (p) {
  return p?.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

export function defaultKeetAppStorage () {
  return expandHome(process.env.KEET_APP_STORAGE || '~/.config/Keet/app-storage')
}

export function defaultKeetAppPath () {
  return expandHome(process.env.KEET_APP_PATH || '~/.local/opt/keet/squashfs-root/resources/app')
}
