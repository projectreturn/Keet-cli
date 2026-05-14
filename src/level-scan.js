import fs from 'node:fs'
import path from 'node:path'
import { defaultKeetAppStorage } from './paths.js'

function safeJson (file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function printableRuns (buf) {
  const s = buf.toString('utf8')
  return s
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n\r\t]/gu, '\n')
    .split(/\n+/)
    .map(x => x.trim())
    .filter(x => x.length >= 5 && /[a-zA-ZäöüÄÖÜß]/.test(x))
}

export function inspectStorage () {
  const storagePath = defaultKeetAppStorage()
  const exists = fs.existsSync(storagePath)
  const profilesPath = path.join(storagePath, 'profiles.json')
  const preferencesPath = path.join(storagePath, 'app-preferences', 'db.json')
  const profilesRaw = safeJson(profilesPath, {})
  const profiles = Array.isArray(profilesRaw?.profiles) ? profilesRaw.profiles : []
  const dbPath = path.join(storagePath, '0', 'db')
  const dbFiles = fs.existsSync(dbPath)
    ? fs.readdirSync(dbPath).map(name => {
        const full = path.join(dbPath, name)
        const st = fs.statSync(full)
        return { name, size: st.size, mtime: st.mtime.toISOString() }
      }).sort((a, b) => a.name.localeCompare(b.name))
    : []

  const messageFragments = []
  if (fs.existsSync(dbPath)) {
    for (const f of dbFiles.filter(f => /\.(log|sst|blob)$/.test(f.name)).slice(-8)) {
      const full = path.join(dbPath, f.name)
      try {
        const buf = fs.readFileSync(full)
        for (const run of printableRuns(buf)) {
          if (/\b(Neo|Hallo|Keet|Nachrichten|Plugin|clawhub|message|chat)\b/i.test(run)) {
            messageFragments.push(run.slice(0, 240))
          }
        }
      } catch {}
    }
  }

  return {
    storagePath,
    exists,
    profilesPathExists: fs.existsSync(profilesPath),
    preferencesPathExists: fs.existsSync(preferencesPath),
    profiles,
    dbPath,
    dbFiles,
    messageFragments: [...new Set(messageFragments)].slice(-50)
  }
}
