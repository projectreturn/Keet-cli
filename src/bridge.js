import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { callWithTimeout, openKeetCore, senderOfMessage, textOfMessage } from './keet-core-session.js'

const AUDIO_DIR = path.resolve('keet-audio')

const DEFAULT_BRIDGE_CONFIG = {
  multiRoom: false,
  allowedRooms: [],
  allowedSenders: ['PR'],
  reportInvites: true
}

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
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return { processed: [], modelMode: 'online' } }
}

function saveState (file, state) {
  ensureDir(file)
  fs.writeFileSync(file, JSON.stringify({ ...state, modelMode: state.modelMode || 'online', processed: state.processed.slice(-500) }, null, 2))
}

function asList (value) {
  if (Array.isArray(value)) return value.map(v => String(v)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return value.split(',').map(v => v.trim()).filter(Boolean)
  return []
}

function loadBridgeConfig (file) {
  const config = { ...DEFAULT_BRIDGE_CONFIG }
  if (file) {
    const loaded = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
    Object.assign(config, loaded)
  }
  config.multiRoom = config.multiRoom === true
  config.allowedRooms = asList(config.allowedRooms)
  config.allowedSenders = asList(config.allowedSenders)
  config.reportInvites = config.reportInvites !== false
  return config
}

function safeName (name) {
  return String(name || 'audio').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

function audioFilesOfMessage (message) {
  const files = message.files || message.message?.files || []
  return files.filter(file => String(file.metadata?.mimetype || '').startsWith('audio/'))
}

function hasInvitationEvent (message) {
  const generic = message.message?.generic || {}
  return Boolean(generic.invitationCreated || generic.memberJoined || generic.memberLeft || generic.memberRemoved)
}

function runCommand ({ cmd, args, timeout = 180000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${cmd} timed out`))
    }, timeout)
    child.stdout.on('data', d => { stdout += String(d) })
    child.stderr.on('data', d => { stderr += String(d) })
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`))
      resolve({ stdout, stderr })
    })
  })
}

async function downloadAudioFile (file, key) {
  const link = file.entry?.httpLink
  if (!link) throw new Error('Audio file has no httpLink')
  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  const audioPath = path.join(AUDIO_DIR, `${Date.now()}-${safeName(file.metadata?.name || `${key}.m4a`)}`)
  const response = await fetch(link)
  if (!response.ok) throw new Error(`Audio download failed: HTTP ${response.status}`)
  fs.writeFileSync(audioPath, Buffer.from(await response.arrayBuffer()))
  return audioPath
}

async function transcribeAudioFile (audioPath) {
  const outDir = path.join(AUDIO_DIR, 'transcripts')
  fs.mkdirSync(outDir, { recursive: true })
  await runCommand({
    cmd: 'whisper',
    args: [audioPath, '--model', process.env.WHISPER_MODEL || 'tiny', '--language', 'de', '--output_dir', outDir, '--output_format', 'txt'],
    timeout: Number(process.env.WHISPER_TIMEOUT_MS || 300000)
  })
  const transcriptPath = path.join(outDir, `${path.basename(audioPath, path.extname(audioPath))}.txt`)
  return fs.readFileSync(transcriptPath, 'utf8').trim()
}

async function transcribeAudioFiles (files, key) {
  const transcripts = []
  for (const [index, file] of files.entries()) {
    const audioPath = await downloadAudioFile(file, `${key}-${index}`)
    const transcript = await transcribeAudioFile(audioPath)
    transcripts.push({
      name: file.metadata?.name || path.basename(audioPath),
      mimetype: file.metadata?.mimetype || 'audio',
      path: audioPath,
      transcript
    })
  }
  return transcripts
}

function normalizeModelMode (value) {
  return value === 'local' ? 'local' : 'online'
}

function parseBridgeCommand (text) {
  const normalized = text.trim().toLowerCase()
  const compact = normalized.replace(/^\//, '').replace(/^!/, '')
  if (['modell lokal', 'model lokal', 'lokal', 'local', 'ki lokal'].includes(compact)) return { type: 'model', mode: 'local' }
  if (['modell online', 'model online', 'online', 'cloud', 'ki online'].includes(compact)) return { type: 'model', mode: 'online' }
  if (['modell status', 'model status', 'status modell', 'ki status'].includes(compact)) return { type: 'status' }
  return null
}

function runLocalOllama ({ message, timeout = 120000, model = 'qwen2.5:3b-instruct' }) {
  return new Promise((resolve, reject) => {
    const child = spawn('ollama', ['run', model, message], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' } })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Ollama timed out'))
    }, timeout)
    child.stdout.on('data', d => { stdout += String(d) })
    child.stderr.on('data', d => { stderr += String(d) })
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`Ollama exited ${code}: ${stderr || stdout}`))
      resolve(stdout.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim())
    })
  })
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

export async function runBridge ({ interval = 3000, dryRun = false, once = false, replay = false, stateFile = '.keet-bridge-state.json', allowedSender = 'PR', configFile = process.env.KEET_BRIDGE_CONFIG || null } = {}) {
  const core = await openKeetCore({ swarming: true })
  const config = loadBridgeConfig(configFile)
  if (!config.allowedSenders.length && allowedSender) config.allowedSenders = [allowedSender]
  const statePath = path.resolve(stateFile)
  const state = loadState(statePath)
  state.modelMode = normalizeModelMode(state.modelMode)
  const processed = new Set(state.processed || [])
  let rooms = []

  async function ensureRooms () {
    if (rooms.length) return rooms
    const recentLimit = config.multiRoom ? 50 : 1
    const recent = await callWithTimeout('getRecentRooms', () => core.api.core.getRecentRooms({ limit: recentLimit }))
    const candidates = recent.rooms || []
    const selected = config.multiRoom
      ? candidates.filter(room => config.allowedRooms.includes(room.roomId))
      : candidates.slice(0, 1)
    if (config.multiRoom && !config.allowedRooms.length) throw new Error('Multi-room bridge requires allowedRooms in config')
    if (!selected.length) throw new Error('No allowed room found')
    rooms = []
    for (const room of selected) {
      const info = await callWithTimeout(`getRoomInfo ${room.roomId}`, () => core.api.core.getRoomInfo(room.roomId))
      rooms.push({ roomId: room.roomId, title: info?.config?.title || '(untitled)' })
    }
    return rooms
  }

  async function send (roomId, text) {
    await callWithTimeout(`addChatMessage ${roomId}`, () => core.api.core.addChatMessage(roomId, text), 30000)
  }

  async function handleMessage (room, m) {
    const key = `${room.roomId}:${messageKey(m)}`
    if (processed.has(key)) return

    const sender = senderOfMessage(m)
    let text = textOfMessage(m).trim()
    const audioFiles = audioFilesOfMessage(m)
    if ((!text && !audioFiles.length) || m.member?.local) return
    if (config.allowedSenders.length && !config.allowedSenders.some(s => s.toLowerCase() === sender.toLowerCase())) {
      processed.add(key)
      state.processed = [...processed].slice(-500)
      saveState(statePath, state)
      console.error(JSON.stringify({ type: 'ignored', reason: 'sender', sender, text }))
      return
    }

    let audioTranscripts = []
    if (audioFiles.length) {
      audioTranscripts = await transcribeAudioFiles(audioFiles, key.replace(/[^a-zA-Z0-9._-]+/g, '_'))
      const transcriptText = audioTranscripts.map((a, i) => `[Audio ${i + 1}: ${a.name}]\n${a.transcript}`).join('\n\n')
      text = text ? `${text}\n\n${transcriptText}` : transcriptText
    }

    console.error(JSON.stringify({ type: 'inbound', sender, text, audio: audioTranscripts.map(a => ({ name: a.name, mimetype: a.mimetype, path: a.path })) }))
    const command = parseBridgeCommand(text)
    if (command) {
      let reply
      if (command.type === 'model') {
        state.modelMode = command.mode
        reply = command.mode === 'local'
          ? 'Lokaler Modus aktiv. Ich antworte jetzt mit Qwen 3B. Für schwere Sachen: „online“ schreiben.'
          : 'Online-Modus aktiv. Ich nutze wieder das starke Modell. Für privat/schnell: „lokal“ schreiben.'
      } else {
        reply = state.modelMode === 'local'
          ? 'Aktueller Modus: lokal / Qwen 3B.'
          : 'Aktueller Modus: online / starkes Modell.'
      }
      await send(room.roomId, reply)
      processed.add(key)
      state.processed = [...processed].slice(-500)
      saveState(statePath, state)
      console.error(JSON.stringify({ type: 'command', command, modelMode: state.modelMode }))
      return
    }

    if (config.reportInvites && hasInvitationEvent(m)) {
      text = `${text}\n\n[Keet-Systemereignis erkannt: Einladung/Mitgliedschaft. Nicht automatisch handeln.]`.trim()
    }

    const prompt = `Nachricht von Neo über Keet${config.multiRoom ? ` in ${room.title}` : ''}${audioTranscripts.length ? ' (Audio wurde lokal transkribiert)' : ''}:\n\n${text}\n\nAntworte kurz, praktisch und auf Deutsch als die Matrix. Keine internen Details erwähnen.`
    if (dryRun) {
      processed.add(key)
      state.processed = [...processed].slice(-500)
      saveState(statePath, state)
      console.error(JSON.stringify({ type: 'dry-run', text: `[dry-run] Empfangen: ${text}` }))
      return
    }
    const reply = state.modelMode === 'local'
      ? await runLocalOllama({ message: prompt })
      : await runOpenClawAgent({ message: prompt })
    if (reply) {
      await send(room.roomId, reply)
      processed.add(key)
      state.processed = [...processed].slice(-500)
      saveState(statePath, state)
      console.error(JSON.stringify({ type: 'outbound', text: reply }))
    }
  }

  try {
    await ensureRooms()
    console.error(`keet-openclaw bridge ready. rooms=${rooms.map(r => `${r.roomId}:${r.title}`).join(',')} multiRoom=${config.multiRoom} dryRun=${dryRun} replay=${replay}`)
    let primed = false
    for (;;) {
      for (const room of rooms) {
        const messages = await callWithTimeout(`getChatMessages ${room.roomId}`, () => core.api.core.getChatMessages(room.roomId, { reverse: true, limit: 30 }), 30000)
        if (!primed && !replay) {
          for (const m of messages || []) processed.add(`${room.roomId}:${messageKey(m)}`)
        } else {
          for (const m of (messages || []).slice().reverse()) await handleMessage(room, m)
        }
      }
      if (!primed || !replay) {
        state.processed = [...processed].slice(-500)
        saveState(statePath, state)
      }
      primed = true
      if (once) break
      await sleep(interval)
    }
  } finally {
    await core.close()
  }
}
