import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { OutisApi } from '../shared/api'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const listener = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OutisApi = {
  pathForFile: (file) => webUtils.getPathForFile(file),

  openDataFile: (path) => invoke('data:open', path),
  runRecipe: (datasetId, rules) => invoke('data:run', datasetId, rules),
  cancelRun: () => invoke('data:cancel'),
  onProgress: (cb) => subscribe('data:progress', cb),
  exportDataset: (datasetId, name) => invoke('data:export', datasetId, name),
  saveRecipe: (recipe) => invoke('recipe:save', recipe),
  loadRecipe: () => invoke('recipe:load'),

  openTextFile: (path) => invoke('text:open', path),
  saveText: (text, name) => invoke('text:save', text, name),
  detectText: (text, options) => invoke('text:detect', text, options),
  anonymiseText: (text, spans, action) => invoke('text:anonymise', text, spans, action),

  getLibrary: () => invoke('library:get'),
  saveLibrary: (lib) => invoke('library:save', lib),
  resetLibrary: () => invoke('library:reset'),
  importLibrary: () => invoke('library:import'),
  exportLibrary: (lib) => invoke('library:export', lib),

  getSettings: () => invoke('settings:get'),
  saveSettings: (s) => invoke('settings:save', s),

  nerStatus: () => invoke('ner:status'),
  warmUpNer: () => invoke('ner:warmup'),
  exportMapping: () => invoke('mapping:export'),

  networkLog: () => invoke('net:log'),
  onNetworkBlocked: (cb) => subscribe('net:blocked', cb),
  appInfo: () => invoke('app:info')
}

contextBridge.exposeInMainWorld('outis', api)
