import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { defaultKeetAppPath, defaultKeetAppStorage } from './paths.js'

function appRequire (appPath) {
  return createRequire(path.join(appPath, 'package.json'))
}

function withTimeout (promise, ms, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ __timeout: true, label }), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

export async function callWithTimeout (label, fn, timeoutMs = 15000) {
  const value = await withTimeout(Promise.resolve().then(fn), timeoutMs, label)
  if (value?.__timeout) throw new Error(`Timed out: ${label}`)
  return value
}

export async function openKeetCore ({ swarming = false } = {}) {
  const appPath = defaultKeetAppPath()
  const storage = defaultKeetAppStorage()
  const req = appRequire(appPath)
  const Sidecar = req('bare-sidecar')
  const FramedStream = req('framed-stream')
  const TinyBufferRPC = req('tiny-buffer-rpc')
  const rpcClientFactory = req('@holepunchto/keet-core/rpc/client')

  const worker = path.join(appPath, '.webpack', 'main', 'workers', 'core', 'index.mjs')
  if (!fs.existsSync(worker)) throw new Error(`Keet core worker not found: ${worker}`)

  const logFile = path.join(storage, 'keet-cli-sidecar.log')
  const args = [
    storage,
    'false',
    'false',
    swarming ? 'true' : 'false',
    'undefined',
    logFile,
    'info',
    'false',
    'production'
  ]

  const sidecar = new Sidecar(worker, args)
  const stdout = []
  const stderr = []
  sidecar.stdout.on('data', d => stdout.push(String(d).trim()))
  sidecar.stderr.on('data', d => stderr.push(String(d).trim()))

  const framed = new FramedStream(sidecar)
  const rpc = new TinyBufferRPC(data => framed.write(data))
  framed.on('data', data => rpc.recv(data))
  const api = rpcClientFactory(rpc)

  async function close () {
    try { sidecar.destroy() } catch {}
    try { sidecar._process?.kill?.('SIGKILL') } catch {}
  }

  return { api, appPath, storage, worker, stdout, stderr, close }
}

export function textOfMessage (message) {
  return message?.chat?.text ?? message?.message?.text ?? message?.chat?.message?.text ?? ''
}

export function senderOfMessage (message) {
  return message?.member?.displayName || message?.member?.name || message?.memberId || '?'
}
