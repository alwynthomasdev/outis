import Papa from 'papaparse'
import type { Dataset, JsonData, TableData } from './types'

export function parseCsv(text: string, hasHeader = true): TableData {
  const bom = text.charCodeAt(0) === 0xfeff
  const body = bom ? text.slice(1) : text
  const res = Papa.parse<string[]>(body, { skipEmptyLines: 'greedy' })
  if (res.errors.length && res.data.length === 0) throw new Error(res.errors[0].message)
  const data = res.data
  const width = data.reduce((w, r) => Math.max(w, r.length), 0)
  let columns: string[]
  let rows: string[][]
  if (hasHeader && data.length > 0) {
    columns = data[0].map((c, i) => c || `Column ${i + 1}`)
    for (let i = columns.length; i < width; i++) columns.push(`Column ${i + 1}`)
    rows = data.slice(1)
  } else {
    columns = Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
    rows = data
  }
  // De-duplicate column names so they can be used as rule keys.
  const seen = new Map<string, number>()
  columns = columns.map((c) => {
    const n = seen.get(c) ?? 0
    seen.set(c, n + 1)
    return n === 0 ? c : `${c} (${n + 1})`
  })
  rows = rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r))
  return {
    kind: 'table',
    columns,
    header: hasHeader && data.length > 0 ? data[0] : [],
    rows,
    delimiter: res.meta.delimiter || ',',
    newline: res.meta.linebreak || '\n',
    bom,
    hasHeader
  }
}

export function serialiseCsv(t: TableData): string {
  const data = t.hasHeader ? [t.header.length ? t.header : t.columns, ...t.rows] : t.rows
  const csv = Papa.unparse(data, { delimiter: t.delimiter, newline: t.newline })
  return (t.bom ? String.fromCharCode(0xfeff) : '') + csv + t.newline
}

export function parseJson(text: string, jsonl = false): JsonData {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (jsonl) {
    const value = body
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l, i) => {
        try {
          return JSON.parse(l)
        } catch (e) {
          throw new Error(`Line ${i + 1}: ${(e as Error).message}`, { cause: e })
        }
      })
    return { kind: 'json', value, jsonl: true, indent: 0 }
  }
  const indentMatch = /\n([ \t]+)\S/.exec(body)
  const indent = indentMatch ? (indentMatch[1].includes('\t') ? 1 : indentMatch[1].length) : 2
  return { kind: 'json', value: JSON.parse(body), jsonl: false, indent }
}

export function serialiseJson(j: JsonData): string {
  if (j.jsonl) return (j.value as unknown[]).map((v) => JSON.stringify(v)).join('\n') + '\n'
  return JSON.stringify(j.value, null, j.indent || 2) + '\n'
}

export function detectFormat(name: string, text: string): 'csv' | 'json' | 'jsonl' {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'jsonl'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv'
  const t = text.trimStart()
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      JSON.parse(t)
      return 'json'
    } catch {
      return 'jsonl'
    }
  }
  return 'csv'
}

export function parseDataset(name: string, text: string, csvHasHeader = true): Dataset {
  const fmt = detectFormat(name, text)
  if (fmt === 'csv') return parseCsv(text, csvHasHeader)
  return parseJson(text, fmt === 'jsonl')
}

export function serialiseDataset(d: Dataset): string {
  return d.kind === 'table' ? serialiseCsv(d) : serialiseJson(d)
}
