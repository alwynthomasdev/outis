// Library and settings files in the user's app data folder.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normaliseLibrary, normaliseSettings, type Library, type Settings } from '../core'

const dir = (): string => app.getPath('userData')

function readJson(file: string): unknown {
  const p = join(dir(), file)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    // Keep the broken file for the user to inspect, start fresh.
    renameSync(p, `${p}.broken-${Date.now()}`)
    return null
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dir(), { recursive: true })
  const p = join(dir(), file)
  writeFileSync(`${p}.tmp`, JSON.stringify(value, null, 2), 'utf8')
  renameSync(`${p}.tmp`, p)
}

export function loadLibrary(): Library {
  return normaliseLibrary(readJson('library.json') as Partial<Library> | null)
}

export function saveLibrary(lib: Library): Library {
  const clean = normaliseLibrary(lib)
  writeJson('library.json', clean)
  return clean
}

export function loadSettings(): Settings {
  const raw = readJson('settings.json') as Partial<Settings> | null
  const s = normaliseSettings(raw)
  // Persist a newly generated consistency key so fakes stay the same between runs.
  if (!raw || raw.consistencyKey !== s.consistencyKey) writeJson('settings.json', s)
  return s
}

export function saveSettings(s: Settings): Settings {
  const clean = normaliseSettings(s)
  writeJson('settings.json', clean)
  return clean
}
