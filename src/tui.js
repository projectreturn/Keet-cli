import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { listRooms, readMessages, sendMessage } from './keet-commands.js'

function clear () {
  output.write('\x1b[2J\x1b[H')
}

function title (text) {
  console.log(`\nkeet-cli TUI — ${text}`)
  console.log('='.repeat(16 + text.length))
}

function summarize (text, max = 80) {
  const oneLine = String(text || '').replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

async function prompt (rl, label) {
  return (await rl.question(label)).trim()
}

async function chooseRoom (rl, rooms) {
  const answer = await prompt(rl, '\nRoom number/id: ')
  const index = Number(answer)
  if (Number.isInteger(index) && index >= 1 && index <= rooms.length) return rooms[index - 1]
  return rooms.find(room => room.roomId === answer || room.title === answer) || null
}

function printRooms (rooms) {
  if (!rooms.length) {
    console.log('No rooms found.')
    return
  }
  for (const [i, room] of rooms.entries()) {
    console.log(`${String(i + 1).padStart(2)}. ${room.title}  ${room.roomId}`)
    console.log(`    messages=${room.chatLength ?? '?'}  writable=${room.writable ? 'yes' : 'no'}  last=${summarize(room.lastText)}`)
  }
}

function printMessages (result) {
  console.log(`\n# ${result.title} (${result.roomId})`)
  if (!result.messages.length) {
    console.log('No messages.')
    return
  }
  for (const message of result.messages.slice().reverse()) {
    const when = message.timestamp ? new Date(message.timestamp).toISOString() : '?'
    const who = message.local ? `${message.sender} (local)` : message.sender
    console.log(`${when} ${who}: ${message.text || '[non-text message]'}`)
  }
}

async function refreshRooms () {
  try {
    return await listRooms()
  } catch (err) {
    console.error(`\nCould not read rooms: ${err.message}`)
    console.error('Tip: stop other live keet-cli/Keet processes, or use the daemon/bridge that owns the storage.')
    return []
  }
}

export async function runTui () {
  const rl = readline.createInterface({ input, output })
  let rooms = []
  let selected = null

  try {
    for (;;) {
      clear()
      title('rooms')
      rooms = await refreshRooms()
      printRooms(rooms)
      if (selected) console.log(`\nSelected: ${selected.title} (${selected.roomId})`)
      console.log('\nCommands: [number/id] select  r refresh  m messages  s send  q quit')

      const command = (await prompt(rl, '> ')).toLowerCase()
      if (command === 'q' || command === 'quit' || command === '/quit') break
      if (command === 'r' || command === 'refresh' || command === '') continue

      if (command === 'm' || command === 'messages') {
        if (!selected) selected = await chooseRoom(rl, rooms)
        if (!selected) {
          await prompt(rl, 'No room selected. Press enter.')
          continue
        }
        clear()
        title('messages')
        try {
          printMessages(await readMessages({ roomId: selected.roomId, limit: 30 }))
        } catch (err) {
          console.error(`Could not read messages: ${err.message}`)
        }
        await prompt(rl, '\nPress enter.')
        continue
      }

      if (command === 's' || command === 'send') {
        if (!selected) selected = await chooseRoom(rl, rooms)
        if (!selected) {
          await prompt(rl, 'No room selected. Press enter.')
          continue
        }
        const text = await prompt(rl, `Message to ${selected.title}: `)
        if (text) {
          try {
            await sendMessage({ roomId: selected.roomId, text })
            console.log('Sent.')
          } catch (err) {
            console.error(`Send failed: ${err.message}`)
          }
        }
        await prompt(rl, 'Press enter.')
        continue
      }

      const byNumber = Number(command)
      selected = Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= rooms.length
        ? rooms[byNumber - 1]
        : rooms.find(room => room.roomId === command || room.title.toLowerCase() === command)
      if (!selected) await prompt(rl, 'Unknown command/room. Press enter.')
    }
  } finally {
    rl.close()
  }
}
