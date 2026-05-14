import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { callWithTimeout, openKeetCore, senderOfMessage, textOfMessage } from './keet-core-session.js'

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function messageKey (m) {
  const id = m.id || {}
  return `${id.deviceId || m.memberId || '?'}:${id.seq ?? m.seq ?? m.clock ?? '?'}:${m.timestamp ?? ''}`
}

function ensureDir (file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
}

function loadState (file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return { processed: [] } }
}

function saveState (file, state) {
  ensureDir(file)
  fs.writeFileSync(file, JSON.stringify({ ...state, processed: state.processed.slice(-500) }, null, 2))
}

function runOpenClawAgent ({ message, timeout = 90000, sessionId = 'keet-neo' }) {
  return new Promise((resolve, reject) => {
    const args = ['agent', '--local', '--session-id', sessionId, '--message', message, '--json', '--thinking', 'off', '--timeout', String(Math.ceil(timeout / 1000))]
    const child = spawn('openclaw', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('OpenClaw agent timed out'))
    }, timeout)
    child.stdout.on('data', d => { stdout += String(d) })
    child.stderr.on('data', d => { stderr += String(d) })
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`OpenClaw agent exited ${code}: ${stderr || stdout}`))
      try {
        const jsonStart = stdout.indexOf('{')
        const parsed = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout)
        const text = parsed.payloads?.map(p => p.text).filter(Boolean).join('\n') || parsed.response || parsed.reply || parsed.message || parsed.output || parsed.text || parsed.assistant || parsed.result?.text || parsed.result?.message || parsed.result?.response
        resolve(String(text || stdout).trim())
      } catch {
        resolve(stdout.trim())
      }
    })
  })
}

export async function runBridge ({ interval = 3000, dryRun = false, once = false, replay = false, stateFile = '.keet-bridge-state.json', allowedSender = 'Neo' } = {}) {
  const core = await openKeetCore({ swarming: true })
  const statePath = path.resolve(stateFile)
  const state = loadState(statePath)
  const processed = new Set(state.processed || [])
  let roomId = null
  let title = '(unknown)'

  async function ensureRoom () {
    if (roomId) return roomId
    const recent = await callWithTimeout('getRecentRooms', () => core.api.core.getRecentRooms({ limit: 1 }))
    roomId = recent.rooms?.[0]?.roomId
    if (!roomId) throw new Error('No room found')
    const info = await callWithTimeout(`getRoomInfo ${roomId}`, () => core.api.core.getRoomInfo(roomId))
    title = info?.config?.title || '(untitled)'
    return roomId
  }

  async function send (text) {
    await callWithTimeout(`addChatMessage ${roomId}`, () => core.api.core.addChatMessage(roomId, text), 30000)
  }

  async function handleMessage (m) {
    const key = messageKey(m)
    if (processed.has(key)) return

    const sender = senderOfMessage(m)
    const text = textOfMessage(m).trim()
    if (!text || m.member?.local) return
    if (allowedSender && sender.toLowerCase() !== allowedSender.toLowerCase()) {
      processed.add(key)
      state.processed = [...processed].slice(-500)
      saveState(statePath, state)
      console.error(JSON.stringify({ type: 'ignored', reason: 'sender', sender, text }))
      return
    }

    console.error(JSON.stringify({ type: 'inbound', sender, text }))
    const prompt = `Nachricht von Neo über Keet:\n\n${text}\n\nAntworte kurz, praktisch und auf Deutsch als die Matrix. Keine internen Details erwähnen.`
    if (dryRun) {
      processed.add(key)
      state.processed = [...processed].slice(-500)
      saveState(statePath, state)
      console.error(JSON.stringify({ type: 'dry-run', text: `[dry-run] Empfangen: ${text}` }))
      return
    }
    const reply = await runOpenClawAgent({ message: prompt })
    if (reply) {
      await send(reply)
      processed.add(key)
      state.processed = [...processed].slice(-500)
      saveState(statePath, state)
      console.error(JSON.stringify({ type: 'outbound', text: reply }))
    }
  }

  try {
    await ensureRoom()
    console.error(`keet-openclaw bridge ready. room=${roomId} title=${title} dryRun=${dryRun} replay=${replay}`)
    let primed = false
    for (;;) {
      const messages = await callWithTimeout(`getChatMessages ${roomId}`, () => core.api.core.getChatMessages(roomId, { reverse: true, limit: 30 }), 30000)
      if (!primed && !replay) {
        for (const m of messages || []) processed.add(messageKey(m))
        state.processed = [...processed].slice(-500)
        saveState(statePath, state)
        primed = true
      } else {
        primed = true
        for (const m of (messages || []).slice().reverse()) await handleMessage(m)
      }
      if (once) break
      await sleep(interval)
    }
  } finally {
    await core.close()
  }
}
