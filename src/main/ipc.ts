import { BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  defaultLibrary,
  normaliseLibrary,
  type FieldRule,
  type Library,
  type Recipe,
  type Settings,
  type Span,
  type TextOptions
} from '../core'
import type { AppInfo, NerStatus, OpenedDataset, RunResult } from '../shared/api'
import { blockedLog } from './offline'
import { loadLibrary, loadSettings, saveLibrary, saveSettings } from './store'
import type { WorkerClient } from './worker-client'

const LARGE_FILE = 200 * 1024 * 1024

const DATA_FILTERS: FileFilter[] = [
  { name: 'Data files', extensions: ['csv', 'tsv', 'json', 'jsonl', 'ndjson'] },
  { name: 'All files', extensions: ['*'] }
]
const TEXT_FILTERS: FileFilter[] = [
  { name: 'Text files', extensions: ['txt', 'md', 'log', 'eml', 'csv', 'json'] },
  { name: 'All files', extensions: ['*'] }
]
const JSON_FILTERS: FileFilter[] = [{ name: 'JSON', extensions: ['json'] }]

function win(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function pickFile(filters: FileFilter[], title: string): Promise<string | null> {
  const w = win()
  const opts = { title, filters, properties: ['openFile' as const] }
  const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
}

async function saveFile(
  defaultPath: string,
  filters: FileFilter[],
  content: string
): Promise<string | null> {
  const w = win()
  const opts = { defaultPath, filters }
  const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null
  writeFileSync(res.filePath, content, 'utf8')
  return res.filePath
}

export function registerIpc(worker: WorkerClient, info: AppInfo): void {
  let library = loadLibrary()
  let settings = loadSettings()
  let currentRun: number | null = null

  const configure = (): Promise<unknown> => worker.request('configure', { library, settings })
  void configure()
  worker.onRestartHook = () => void configure()

  // ---- data files -----------------------------------------------------------

  ipcMain.handle('data:open', async (_e, givenPath?: string): Promise<OpenedDataset | null> => {
    const path = givenPath ?? (await pickFile(DATA_FILTERS, 'Open a CSV or JSON file'))
    if (!path) return null
    const size = statSync(path).size
    if (size > LARGE_FILE) {
      const w = win()
      const opts = {
        type: 'warning' as const,
        buttons: ['Open anyway', 'Cancel'],
        defaultId: 1,
        message: `This file is ${(size / 1024 / 1024).toFixed(0)} MB.`,
        detail: 'Large files are loaded into memory and may be slow.'
      }
      const choice = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts)
      if (choice.response !== 0) return null
    }
    const text = readFileSync(path, 'utf8')
    const res = await worker.request<Omit<OpenedDataset, 'name' | 'path' | 'size'>>('loadDataset', {
      name: basename(path),
      text
    })
    return { ...res, name: basename(path), path, size }
  })

  ipcMain.handle(
    'data:run',
    async (e, datasetId: string, rules: FieldRule[]): Promise<RunResult> => {
      const { jobId, promise } = worker.startJob<RunResult>('run', { datasetId, rules }, (p) =>
        e.sender.send('data:progress', p)
      )
      currentRun = jobId
      try {
        return await promise
      } finally {
        currentRun = null
      }
    }
  )

  ipcMain.handle('data:cancel', async () => {
    if (currentRun !== null) await worker.request('cancel', { jobId: currentRun })
  })

  ipcMain.handle('data:export', async (_e, datasetId: string, name: string) => {
    const content = await worker.request<string>('serialise', { datasetId })
    const ext = extname(name) || '.csv'
    const suggested = `${basename(name, ext)}.anonymised${ext}`
    return saveFile(suggested, DATA_FILTERS, content)
  })

  ipcMain.handle('recipe:save', (_e, recipe: Recipe) =>
    saveFile(
      `${recipe.name || 'recipe'}.outis-recipe.json`,
      JSON_FILTERS,
      JSON.stringify(recipe, null, 2)
    )
  )

  ipcMain.handle('recipe:load', async (): Promise<Recipe | null> => {
    const path = await pickFile(JSON_FILTERS, 'Load a recipe')
    if (!path) return null
    const recipe = JSON.parse(readFileSync(path, 'utf8')) as Recipe
    if (!recipe || !Array.isArray(recipe.rules))
      throw new Error('This file is not an Outis recipe.')
    return recipe
  })

  // ---- text -------------------------------------------------------------------

  ipcMain.handle('text:open', async (_e, givenPath?: string) => {
    const path = givenPath ?? (await pickFile(TEXT_FILTERS, 'Open a text file'))
    if (!path) return null
    return { name: basename(path), text: readFileSync(path, 'utf8') }
  })

  ipcMain.handle('text:save', (_e, text: string, name: string) => {
    const ext = extname(name) || '.txt'
    return saveFile(`${basename(name, ext)}.anonymised${ext}`, TEXT_FILTERS, text)
  })

  ipcMain.handle('text:detect', (_e, text: string, options?: Partial<TextOptions>) =>
    worker.request<Span[]>('detect', { text, options })
  )

  ipcMain.handle(
    'text:anonymise',
    (_e, text: string, spans: Span[], action?: TextOptions['action']) =>
      worker.request('anonymiseText', { text, spans, action })
  )

  // ---- library & settings ------------------------------------------------------

  ipcMain.handle('library:get', () => library)

  ipcMain.handle('library:save', async (_e, lib: Library) => {
    library = saveLibrary(lib)
    await configure()
    return library
  })

  ipcMain.handle('library:reset', async () => {
    library = saveLibrary(defaultLibrary())
    await configure()
    return library
  })

  ipcMain.handle('library:import', async () => {
    const path = await pickFile(JSON_FILTERS, 'Import a PII library')
    if (!path) return null
    library = saveLibrary(normaliseLibrary(JSON.parse(readFileSync(path, 'utf8'))))
    await configure()
    return library
  })

  ipcMain.handle('library:export', (_e, lib: Library) =>
    saveFile('outis-library.json', JSON_FILTERS, JSON.stringify(normaliseLibrary(lib), null, 2))
  )

  ipcMain.handle('settings:get', () => settings)

  ipcMain.handle('settings:save', async (_e, s: Settings) => {
    settings = saveSettings(s)
    await configure()
    return settings
  })

  // ---- misc ----------------------------------------------------------------------

  ipcMain.handle('ner:status', () => worker.request<NerStatus>('nerStatus'))
  ipcMain.handle('ner:warmup', () => worker.request<NerStatus>('warmUp'))

  ipcMain.handle('mapping:export', async () => {
    const entries =
      await worker.request<{ type: string; original: string; fake: string }[]>('mapping')
    const w = win()
    const opts = {
      type: 'warning' as const,
      buttons: ['Export mapping', 'Cancel'],
      defaultId: 1,
      message: 'The mapping file contains the ORIGINAL personal data.',
      detail:
        'Anyone with this file can reverse the anonymisation. Store it securely, or don’t export it.'
    }
    const choice = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts)
    if (choice.response !== 0) return null
    return saveFile('outis-mapping.SENSITIVE.json', JSON_FILTERS, JSON.stringify(entries, null, 2))
  })

  ipcMain.handle('net:log', () => blockedLog())
  ipcMain.handle('app:info', (): AppInfo => info)
}
