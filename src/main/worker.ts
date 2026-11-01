// Background worker (Electron utilityProcess). Runs parsing, anonymisation and the NER model
// so the window stays responsive. It has no network access: see lockDownNetwork().
import { existsSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import {
  CancelledError,
  Mapper,
  anonymiseText,
  chunkText,
  detectRules,
  mergeSpans,
  normaliseLibrary,
  normaliseSettings,
  parseDataset,
  profileJson,
  profileTable,
  runJson,
  runTable,
  serialiseDataset,
  summarise,
  tokensToSpans,
  type Dataset,
  type FieldRule,
  type Library,
  type NerToken,
  type Settings,
  type Span,
  type TextOptions
} from '../core'
import {
  MODEL_FILE,
  MODEL_ID,
  type NerStatus,
  type WorkerRequest,
  type WorkerResponse
} from './protocol'

// ---- offline lock-down ------------------------------------------------------

function lockDownNetwork(): void {
  const refuse = (what: string): never => {
    send({ event: 'network-blocked', data: { url: what, source: 'worker' } })
    throw new Error(`Network access is disabled in Outis (${what})`)
  }
  globalThis.fetch = (async (input: unknown) =>
    refuse(String(input instanceof Request ? input.url : input))) as typeof fetch
  const connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const opts = args[0] as { path?: string } | undefined
    // Allow local IPC pipes (used by the inspector in dev), refuse everything else.
    if (opts && typeof opts === 'object' && typeof opts.path === 'string') {
      return (connect as (...a: unknown[]) => net.Socket).apply(this, args)
    }
    return refuse(`socket ${JSON.stringify(args[0])}`)
  } as typeof net.Socket.prototype.connect
}

// ---- messaging ---------------------------------------------------------------

const port = process.parentPort

function send(msg: WorkerResponse): void {
  port.postMessage(msg)
}

// ---- state -------------------------------------------------------------------

const modelRoot = process.argv[2] ?? ''
let library: Library = normaliseLibrary(null)
let settings: Settings = normaliseSettings(null)
let mapper = new Mapper(settings.consistencyKey, library)
let configKey = ''

interface Loaded {
  name: string
  data: Dataset
  output?: Dataset
}
const datasets = new Map<string, Loaded>()
const cancelled = new Set<number>()
let nextId = 1

// ---- NER ---------------------------------------------------------------------

type NerPipe = (
  texts: string | string[],
  opts: { ignore_labels: string[] }
) => Promise<NerToken[] | NerToken[][]>
let nerPipe: Promise<NerPipe> | null = null
let nerError: string | null = null
let nerLoaded = false

function modelPresent(): boolean {
  return existsSync(join(modelRoot, ...MODEL_ID.split('/'), MODEL_FILE))
}

function loadNer(): Promise<NerPipe> {
  if (!nerPipe) {
    nerPipe = (async () => {
      if (!modelPresent())
        throw new Error('Model not installed. Run "npm run fetch-model" and restart.')
      const t = await import('@huggingface/transformers')
      t.env.allowRemoteModels = false
      t.env.allowLocalModels = true
      t.env.localModelPath = modelRoot
      t.env.useFSCache = false
      t.env.useBrowserCache = false
      const pipe = await t.pipeline('token-classification', MODEL_ID, { dtype: 'q8' })
      nerLoaded = true
      return pipe as unknown as NerPipe
    })().catch((e) => {
      nerError = (e as Error).message
      nerPipe = null
      throw e
    })
  }
  return nerPipe
}

function nerStatus(): NerStatus {
  return { modelId: MODEL_ID, installed: modelPresent(), loaded: nerLoaded, error: nerError }
}

/** Run NER over many texts, batching chunks for speed. */
async function nerSpansMany(texts: string[]): Promise<Span[][]> {
  const pipe = await loadNer()
  const jobs: { text: string; offset: number; owner: number }[] = []
  texts.forEach((t, owner) => {
    for (const c of chunkText(t)) if (c.text.trim()) jobs.push({ ...c, owner })
  })
  const result: Span[][] = texts.map(() => [])
  const BATCH = 8
  for (let i = 0; i < jobs.length; i += BATCH) {
    const group = jobs.slice(i, i + BATCH)
    const raw = await pipe(
      group.map((g) => g.text),
      { ignore_labels: [] }
    )
    const lists = (
      group.length === 1 && !Array.isArray((raw as unknown[])[0]) ? [raw] : raw
    ) as NerToken[][]
    group.forEach((g, j) =>
      result[g.owner].push(...tokensToSpans(g.text, lists[j] ?? [], g.offset))
    )
  }
  return result
}

async function detectMany(texts: string[], opts: TextOptions): Promise<Span[][]> {
  let ner: Span[][] | null = null
  if (opts.useNer && modelPresent()) {
    try {
      ner = await nerSpansMany(texts)
    } catch {
      ner = null
    }
  }
  const enabled = new Set(opts.enabledTypes)
  return texts.map((text, i) => {
    // The name dictionary fills in for the model when it's off or unavailable.
    const spans = detectRules(text, { library, dictionaryNames: ner === null })
    if (ner) spans.push(...ner[i].filter((s) => s.score >= opts.nerThreshold))
    return mergeSpans(
      spans.filter((s) => s.source === 'deny' || enabled.has(s.type)),
      library.allowList
    )
  })
}

// ---- handlers ----------------------------------------------------------------

type Handler = (params: never, ctx: { id: number }) => unknown

const handlers: Record<string, Handler> = {
  configure: (p: { library: Library; settings: Settings }) => {
    library = normaliseLibrary(p.library)
    settings = normaliseSettings(p.settings)
    const key = settings.consistencyKey + JSON.stringify(library)
    if (key !== configKey) {
      mapper = new Mapper(settings.consistencyKey, library)
      configKey = key
    }
    return true
  },

  nerStatus: () => nerStatus(),

  warmUp: async () => {
    if (!modelPresent()) return nerStatus()
    try {
      await loadNer()
    } catch {
      /* reported in status */
    }
    return nerStatus()
  },

  loadDataset: (p: { name: string; text: string }) => {
    const data = parseDataset(p.name, p.text, settings.csvHasHeader)
    const id = `ds${nextId++}`
    datasets.set(id, { name: p.name, data })
    const fields = data.kind === 'table' ? profileTable(data, library) : profileJson(data, library)
    return { id, data, fields }
  },

  run: async (p: { datasetId: string; rules: FieldRule[] }, ctx) => {
    const ds = datasets.get(p.datasetId)
    if (!ds) throw new Error('Dataset not loaded')
    const deps = {
      mapper,
      scan: (texts: string[]) => detectMany(texts, settings.text),
      scanAction: settings.text.action,
      onProgress: (done: number, total: number) => send({ id: ctx.id, progress: { done, total } }),
      isCancelled: () => cancelled.has(ctx.id)
    }
    try {
      if (ds.data.kind === 'table') {
        const { output, changes } = await runTable(ds.data, p.rules, deps)
        ds.output = output
        return { output, changes, summary: summarise(changes) }
      }
      const { output, changes } = await runJson(ds.data, p.rules, deps)
      ds.output = output
      return { output, changes, summary: summarise(changes) }
    } finally {
      cancelled.delete(ctx.id)
    }
  },

  cancel: (p: { jobId: number }) => {
    cancelled.add(p.jobId)
    return true
  },

  serialise: (p: { datasetId: string }) => {
    const ds = datasets.get(p.datasetId)
    if (!ds?.output) throw new Error('Nothing to export yet')
    return serialiseDataset(ds.output)
  },

  detect: async (p: { text: string; options?: Partial<TextOptions> }) => {
    const [spans] = await detectMany([p.text], { ...settings.text, ...(p.options ?? {}) })
    return spans
  },

  anonymiseText: (p: { text: string; spans: Span[]; action?: TextOptions['action'] }) =>
    anonymiseText(p.text, mergeSpans(p.spans), mapper, p.action ?? settings.text.action),

  mapping: () => mapper.entries(),

  release: (p: { datasetId: string }) => datasets.delete(p.datasetId)
}

// ---- main loop ---------------------------------------------------------------

lockDownNetwork()

port.on('message', async (e: { data: WorkerRequest }) => {
  const { id, method, params } = e.data
  const handler = handlers[method]
  if (!handler) {
    send({ id, error: `Unknown method ${method}` })
    return
  }
  try {
    const result = await handler(params as never, { id })
    send({ id, result })
  } catch (err) {
    const message = err instanceof CancelledError ? 'Cancelled' : (err as Error).message
    send({ id, error: message, cancelled: err instanceof CancelledError })
  }
})

send({ event: 'ready', data: nerStatus() })
