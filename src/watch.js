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
    seq: m.seq,
    clock: m.clock,
    timestamp: m.timestamp,
    sender: senderOfMessage(m),
    text: textOfMessage(m),
    local: !!m.member?.local
  }
}

export async function watchMessages ({ roomId, interval = 5000, limit = 20, once = false, includeLocal = false, onMessage = null } = {}) {
  const core = await openKeetCore({ swarming: true })
  const seen = new Set()
  let targetRoomId = roomId
  let title = '(unknown)'

  try {
    if (!targetRoomId) {
      const recent = await callWithTimeout('getRecentRooms', () => core.api.core.getRecentRooms({ limit: 1 }))
      targetRoomId = recent.rooms?.[0]?.roomId
    }
    if (!targetRoomId) throw new Error('No room found')

    const info = await callWithTimeout(`getRoomInfo ${targetRoomId}`, () => core.api.core.getRoomInfo(targetRoomId))
    title = info?.config?.title || '(untitled)'

    async function poll ({ prime = false } = {}) {
      const messages = await callWithTimeout(`getChatMessages ${targetRoomId}`, () => core.api.core.getChatMessages(targetRoomId, { reverse: true, limit }), 20000)
      const normalized = (messages || []).map(normalizeMessage).reverse()
      const fresh = []
      for (const m of normalized) {
        if (seen.has(m.key)) continue
        seen.add(m.key)
        if (!prime && (includeLocal || !m.local)) fresh.push(m)
      }
      return fresh
    }

    await poll({ prime: true })
    if (once) return { roomId: targetRoomId, title, messages: [] }

    for (;;) {
      await sleep(interval)
      const fresh = await poll()
      for (const m of fresh) {
        if (onMessage) onMessage(m, { roomId: targetRoomId, title })
      }
    }
  } finally {
    await core.close()
  }
}
