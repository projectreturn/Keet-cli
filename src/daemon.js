import fs from 'node:fs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { callWithTimeout, openKeetCore, senderOfMessage, textOfMessage } from './keet-core-session.js'

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function messageKey (m) {
  const id = m.id || {}
  return `${id.deviceId || m.memberId || '?'}:${id.seq ?? m.seq ?? m.clock ?? '?'}:${m.timestamp ?? ''}`
}

function normalizeMessage (m) {
  return {
    key: messageKey(m),
    timestamp: m.timestamp,
    sender: senderOfMessage(m),
    text: textOfMessage(m),
    local: !!m.member?.local
  }
}

export async function runDaemon ({ interval = 3000, includeLocal = false } = {}) {
  const core = await openKeetCore({ swarming: true })
  const seen = new Set()
  let closed = false
  let apiChain = Promise.resolve()
  let currentRoomId = null
  let currentTitle = '(unknown)'

  async function lockedCall (label, fn, timeout) {
    const previous = apiChain
    let release
    apiChain = new Promise(resolve => { release = resolve })
    await previous
    try {
      return await callWithTimeout(label, fn, timeout)
    } finally {
      release()
    }
  }

  async function ensureRoom () {
    if (currentRoomId) return currentRoomId
    const recent = await lockedCall('getRecentRooms', () => core.api.core.getRecentRooms({ limit: 1 }))
    currentRoomId = recent.rooms?.[0]?.roomId
    if (!currentRoomId) throw new Error('No room found')
    const info = await lockedCall(`getRoomInfo ${currentRoomId}`, () => core.api.core.getRoomInfo(currentRoomId))
    currentTitle = info?.config?.title || '(untitled)'
    return currentRoomId
  }

  async function poll ({ prime = false } = {}) {
    const roomId = await ensureRoom()
    const messages = await lockedCall(`getChatMessages ${roomId}`, () => core.api.core.getChatMessages(roomId, { reverse: true, limit: 30 }), 20000)
    const normalized = (messages || []).map(normalizeMessage).reverse()
    for (const m of normalized) {
      if (seen.has(m.key)) continue
      seen.add(m.key)
      if (!prime && (includeLocal || !m.local)) {
        console.log(JSON.stringify({ type: 'message', room: { roomId, title: currentTitle }, message: m }))
      }
    }
  }

  async function send (text) {
    const roomId = await ensureRoom()
    await lockedCall(`addChatMessage ${roomId}`, () => core.api.core.addChatMessage(roomId, text), 20000)
    console.log(JSON.stringify({ type: 'sent', room: { roomId, title: currentTitle }, text }))
  }

  async function loopPoll () {
    await poll({ prime: true })
    while (!closed) {
      await sleep(interval)
      try { await poll() } catch (err) { console.error(JSON.stringify({ type: 'error', error: err.message })) }
    }
  }

  console.error(`keet-cli daemon ready. room=${await ensureRoom()} title=${currentTitle}`)
  console.error('Commands: /send text | /rooms | /messages [n] | /quit')
  const pollPromise = input.isTTY ? loopPoll() : Promise.resolve()

  async function handleLine (line) {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (trimmed === '/quit' || trimmed === '/exit') return true
    if (trimmed === '/rooms') {
      const recent = await lockedCall('getRecentRooms', () => core.api.core.getRecentRooms({ limit: 50 }))
      console.log(JSON.stringify({ type: 'rooms', rooms: recent.rooms || [] }))
    } else if (trimmed.startsWith('/messages')) {
      const n = Number(trimmed.split(/\s+/)[1] || 10)
      const roomId = await ensureRoom()
      const messages = await lockedCall(`getChatMessages ${roomId}`, () => core.api.core.getChatMessages(roomId, { reverse: true, limit: n }), 20000)
      console.log(JSON.stringify({ type: 'messages', room: { roomId, title: currentTitle }, messages: (messages || []).map(normalizeMessage) }))
    } else if (trimmed.startsWith('/send ')) {
      await send(trimmed.slice(6))
    } else {
      await send(trimmed)
    }
    return false
  }

  try {
    if (!input.isTTY) {
      const script = fs.readFileSync(0, 'utf8').split(/\r?\n/)
      for (const line of script) if (await handleLine(line)) break
    } else {
      const rl = readline.createInterface({ input, output, terminal: true })
      output.write('keet> ')
      try {
        for await (const line of rl) {
          if (await handleLine(line)) break
          output.write('keet> ')
        }
      } finally {
        rl.close()
      }
    }
  } finally {
    closed = true
    await core.close()
    await Promise.race([pollPromise.catch(() => {}), sleep(100)])
  }
}
