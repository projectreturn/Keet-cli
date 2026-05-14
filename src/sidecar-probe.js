import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { defaultKeetAppPath, defaultKeetAppStorage } from './paths.js'

function copyDir (src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: false, force: true })
}

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

async function callSafe (label, fn, timeoutMs = 8000) {
  try {
    const value = await withTimeout(Promise.resolve().then(fn), timeoutMs, label)
    if (value?.__timeout) return { label, ok: false, timeout: true }
    return { label, ok: true, value }
  } catch (err) {
    return { label, ok: false, error: { message: err?.message, code: err?.code, stack: err?.stack?.split('\n').slice(0, 4).join('\n') } }
  }
}

export async function probeSidecar ({ live = false } = {}) {
  const appPath = defaultKeetAppPath()
  const storage = defaultKeetAppStorage()
  const req = appRequire(appPath)
  const Sidecar = req('bare-sidecar')
  const FramedStream = req('framed-stream')
  const TinyBufferRPC = req('tiny-buffer-rpc')
  const rpcClientFactory = req('@holepunchto/keet-core/rpc/client')

  const worker = path.join(appPath, '.webpack', 'main', 'workers', 'core', 'index.mjs')
  const runStorage = live ? storage : fs.mkdtempSync(path.join(os.tmpdir(), 'keet-cli-storage-'))
  if (!live) copyDir(storage, runStorage)

  const logFile = path.join(runStorage, 'keet-cli-sidecar.log')
  const args = [
    runStorage,
    'false', // devMirrors
    'false', // devUserRegistry
    'false', // swarming/network off for safe local read probe
    'undefined', // hyperconfKey
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

  const results = []
  const calls = [
    ['core.getVersion', () => api.core.getVersion({}), 5000],
    ['core.getIdentity', () => api.core.getIdentity({}), 5000],
    ['core.getRecentRooms', () => api.core.getRecentRooms({ limit: 20 }), 5000]
  ]
  let recentRooms = null
  for (const [label, fn, timeout] of calls) {
    const result = await callSafe(label, fn, timeout)
    results.push(result)
    if (label === 'core.getRecentRooms' && result.ok) recentRooms = result.value?.rooms || []
    if (!result.ok) break
  }

  for (const room of recentRooms || []) {
    const roomId = room.roomId
    results.push(await callSafe(`core.getRoomInfo ${roomId}`, () => api.core.getRoomInfo(roomId), 8000))
    results.push(await callSafe(`core.getChatLength ${roomId}`, () => api.core.getChatLength(roomId), 8000))
    results.push(await callSafe(`core.getChatMessages ${roomId}`, () => api.core.getChatMessages(roomId, { reverse: true, limit: 20 }), 12000))
  }

  try { sidecar.destroy() } catch {}
  try { sidecar._process?.kill?.('SIGKILL') } catch {}

  return {
    appPath,
    worker,
    sourceStorage: storage,
    runStorage,
    live,
    stdout: stdout.filter(Boolean),
    stderr: stderr.filter(Boolean),
    results
  }
}
