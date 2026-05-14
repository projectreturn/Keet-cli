import { callWithTimeout, openKeetCore, senderOfMessage, textOfMessage } from './keet-core-session.js'

export async function listRooms () {
  const core = await openKeetCore()
  try {
    const recent = await callWithTimeout('getRecentRooms', () => core.api.core.getRecentRooms({ limit: 50 }))
    const rooms = []
    for (const room of recent.rooms || []) {
      const info = await callWithTimeout(`getRoomInfo ${room.roomId}`, () => core.api.core.getRoomInfo(room.roomId))
      rooms.push({
        roomId: room.roomId,
        title: info?.config?.title || '(untitled)',
        roomType: info?.config?.roomType,
        writable: !!info?.status?.isWritable,
        readable: !!info?.status?.isReadable,
        chatLength: info?.stats?.chat?.clock ?? null,
        lastText: textOfMessage(info?.lastMessage)
      })
    }
    return rooms
  } finally {
    await core.close()
  }
}

export async function readMessages ({ roomId, limit = 20 } = {}) {
  const core = await openKeetCore()
  try {
    let targetRoomId = roomId
    if (!targetRoomId) {
      const recent = await callWithTimeout('getRecentRooms', () => core.api.core.getRecentRooms({ limit: 1 }))
      targetRoomId = recent.rooms?.[0]?.roomId
    }
    if (!targetRoomId) throw new Error('No room found')
    const info = await callWithTimeout(`getRoomInfo ${targetRoomId}`, () => core.api.core.getRoomInfo(targetRoomId))
    const messages = await callWithTimeout(`getChatMessages ${targetRoomId}`, () => core.api.core.getChatMessages(targetRoomId, { reverse: true, limit }))
    return {
      roomId: targetRoomId,
      title: info?.config?.title || '(untitled)',
      messages: (messages || []).map(m => ({
        seq: m.seq,
        clock: m.clock,
        timestamp: m.timestamp,
        sender: senderOfMessage(m),
        text: textOfMessage(m),
        local: !!m.member?.local
      }))
    }
  } finally {
    await core.close()
  }
}

export async function sendMessage ({ roomId, text, swarming = true } = {}) {
  if (!text) throw new Error('Missing message text')
  const core = await openKeetCore({ swarming })
  try {
    let targetRoomId = roomId
    if (!targetRoomId) {
      const recent = await callWithTimeout('getRecentRooms', () => core.api.core.getRecentRooms({ limit: 1 }))
      targetRoomId = recent.rooms?.[0]?.roomId
    }
    if (!targetRoomId) throw new Error('No room found')
    await callWithTimeout(`addChatMessage ${targetRoomId}`, () => core.api.core.addChatMessage(targetRoomId, text), 20000)
    const info = await callWithTimeout(`getRoomInfo ${targetRoomId}`, () => core.api.core.getRoomInfo(targetRoomId))
    return { roomId: targetRoomId, title: info?.config?.title || '(untitled)', sent: true, text }
  } finally {
    await core.close()
  }
}
