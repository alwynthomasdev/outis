import { applyAction } from './actions'
import type { Mapper } from './mapper'
import { collectLeaves, pathMatches } from './paths'
import { anonymiseText } from './text'
import type {
  CellChange,
  FieldRule,
  JsonChange,
  JsonData,
  PiiType,
  RunSummary,
  Span,
  TableData,
  TextOptions
} from './types'

/** Finds PII spans in a batch of texts (rules + optional ML). */
export type ScanFn = (texts: string[]) => Promise<Span[][]>

export interface EngineDeps {
  mapper: Mapper
  scan: ScanFn
  scanAction?: TextOptions['action']
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

const NAME_TYPES = new Set<PiiType>(['PERSON', 'FIRST_NAME', 'LAST_NAME'])

/**
 * Rules run in passes: names first (so emails and usernames can reuse the name mapping),
 * then everything else, then free-text scans.
 */
const passOf = (r: FieldRule): number => (r.action === 'scan' ? 2 : NAME_TYPES.has(r.type) ? 0 : 1)

const SCAN_BATCH = 64

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
  }
}

interface Target {
  get: () => string
  set: (v: string) => void
  rule: FieldRule
  record: (before: string, after: string, type: PiiType) => void
}

async function runTargets(targets: Target[], deps: EngineDeps): Promise<void> {
  const total = targets.length
  let done = 0
  const tick = (): void => {
    done++
    if (done % 2000 === 0) {
      deps.onProgress?.(done, total)
      if (deps.isCancelled?.()) throw new CancelledError()
    }
  }
  for (const pass of [0, 1]) {
    for (const t of targets) {
      if (passOf(t.rule) !== pass) continue
      const before = t.get()
      const after = applyAction(before, t.rule, deps.mapper)
      if (after !== before) {
        t.set(after)
        t.record(before, after, t.rule.type)
      }
      tick()
    }
  }
  const scans = targets.filter((t) => passOf(t.rule) === 2 && t.get().trim() !== '')
  for (let i = 0; i < scans.length; i += SCAN_BATCH) {
    const batch = scans.slice(i, i + SCAN_BATCH)
    const spans = await deps.scan(batch.map((t) => t.get()))
    batch.forEach((t, j) => {
      const before = t.get()
      const res = anonymiseText(before, spans[j], deps.mapper, deps.scanAction ?? 'fake')
      if (res.output !== before) {
        t.set(res.output)
        const types = [...new Set(res.replacements.map((r) => r.type))]
        t.record(before, res.output, types.length === 1 ? types[0] : 'GENERIC')
      }
      tick()
    })
    deps.onProgress?.(done, total)
    if (deps.isCancelled?.()) throw new CancelledError()
  }
  deps.onProgress?.(total, total)
}

export async function runTable(
  table: TableData,
  rules: FieldRule[],
  deps: EngineDeps
): Promise<{ output: TableData; changes: CellChange[] }> {
  const output: TableData = { ...table, rows: table.rows.map((r) => [...r]) }
  const byCol = new Map<number, FieldRule>()
  for (const r of rules) {
    const col = table.columns.indexOf(r.field)
    if (col >= 0 && r.action !== 'keep') byCol.set(col, r)
  }
  const changes: CellChange[] = []
  const targets: Target[] = []
  output.rows.forEach((row, ri) => {
    for (const [col, rule] of byCol) {
      targets.push({
        get: () => row[col] ?? '',
        set: (v) => (row[col] = v),
        rule,
        record: (before, after, type) => changes.push({ row: ri, col, before, after, type })
      })
    }
  })
  await runTargets(targets, deps)
  changes.sort((a, b) => a.row - b.row || a.col - b.col)
  return { output, changes }
}

export async function runJson(
  data: JsonData,
  rules: FieldRule[],
  deps: EngineDeps
): Promise<{ output: JsonData; changes: JsonChange[] }> {
  const value = structuredClone(data.value)
  const output: JsonData = { ...data, value }
  const active = rules.filter((r) => r.action !== 'keep')
  const changes: JsonChange[] = []
  const targets: Target[] = []
  for (const leaf of collectLeaves(value)) {
    // Exact path rules win over wildcard patterns.
    const rule =
      active.find((r) => r.field === leaf.general) ??
      active.find((r) => pathMatches(leaf.general, r.field))
    if (!rule) continue
    const wasNumber = typeof leaf.value === 'number'
    let current = String(leaf.value)
    targets.push({
      get: () => current,
      set: (v) => {
        current = v
        leaf.set(wasNumber && /^-?\d+(\.\d+)?$/.test(v) && String(Number(v)) === v ? Number(v) : v)
      },
      rule,
      record: (before, after, type) =>
        changes.push({ path: leaf.path, field: leaf.general, before, after, type })
    })
  }
  await runTargets(targets, deps)
  return { output, changes }
}

export function summarise(
  changes: { type: PiiType; row?: number; path?: string; col?: number; field?: string }[]
): RunSummary {
  const byType: RunSummary['byType'] = {}
  const rows = new Set<string>()
  const fields = new Set<string>()
  for (const c of changes) {
    byType[c.type] = (byType[c.type] ?? 0) + 1
    if (c.row !== undefined) rows.add(String(c.row))
    else if (c.path) rows.add(/^\[(\d+)\]/.exec(c.path)?.[1] ?? c.path.split(/[.[]/)[0])
    fields.add(c.col !== undefined ? String(c.col) : (c.field ?? ''))
  }
  return { changed: changes.length, byType, rowsAffected: rows.size, fieldsTouched: fields.size }
}
