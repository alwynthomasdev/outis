// The API the preload script exposes to the window as `window.outis`.
import type {
  CellChange,
  Dataset,
  FieldProfile,
  FieldRule,
  JsonChange,
  Library,
  Recipe,
  RunSummary,
  Settings,
  Span,
  TextOptions,
  TextResult
} from '../core/types'

export interface OpenedDataset {
  id: string
  name: string
  path: string
  size: number
  data: Dataset
  fields: FieldProfile[]
}

export interface RunResult {
  output: Dataset
  changes: CellChange[] | JsonChange[]
  summary: RunSummary
}

export interface NerStatus {
  modelId: string
  installed: boolean
  loaded: boolean
  error: string | null
}

export interface BlockedRequest {
  time: string
  url: string
  source: string
}

export interface AppInfo {
  version: string
  userData: string
  modelDir: string
  dev: boolean
}

export interface OutisApi {
  pathForFile(file: File): string

  openDataFile(path?: string): Promise<OpenedDataset | null>
  runRecipe(datasetId: string, rules: FieldRule[]): Promise<RunResult>
  cancelRun(): Promise<void>
  onProgress(cb: (p: { done: number; total: number }) => void): () => void
  exportDataset(datasetId: string, suggestedName: string): Promise<string | null>
  saveRecipe(recipe: Recipe): Promise<string | null>
  loadRecipe(): Promise<Recipe | null>

  openTextFile(path?: string): Promise<{ name: string; text: string } | null>
  saveText(text: string, suggestedName: string): Promise<string | null>
  detectText(text: string, options?: Partial<TextOptions>): Promise<Span[]>
  anonymiseText(text: string, spans: Span[], action?: TextOptions['action']): Promise<TextResult>

  getLibrary(): Promise<Library>
  saveLibrary(lib: Library): Promise<Library>
  resetLibrary(): Promise<Library>
  importLibrary(): Promise<Library | null>
  exportLibrary(lib: Library): Promise<string | null>

  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<Settings>

  nerStatus(): Promise<NerStatus>
  warmUpNer(): Promise<NerStatus>
  exportMapping(): Promise<string | null>

  networkLog(): Promise<BlockedRequest[]>
  onNetworkBlocked(cb: (b: BlockedRequest) => void): () => void
  appInfo(): Promise<AppInfo>
}
