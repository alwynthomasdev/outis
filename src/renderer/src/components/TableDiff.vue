<script setup lang="ts">
import { computed, h } from 'vue'
import { NDataTable, type DataTableColumns } from 'naive-ui'
import type { CellChange, TableData } from '@core/types'
import DiffText from './DiffText.vue'

export type TableMode = 'inline' | 'side' | 'original' | 'output'

const props = defineProps<{
  original: TableData
  output: TableData
  changes: CellChange[]
  mode: TableMode
  changedOnly: boolean
}>()

const byCell = computed(() => {
  const m = new Map<string, CellChange>()
  for (const c of props.changes) m.set(`${c.row}:${c.col}`, c)
  return m
})

const changedRows = computed(() => new Set(props.changes.map((c) => c.row)))

const perColumn = computed(() => {
  const counts = new Array(props.original.columns.length).fill(0)
  for (const c of props.changes) counts[c.col]++
  return counts as number[]
})

const rows = computed(() => {
  const all = props.original.rows.map((_, i) => ({ i }))
  return props.changedOnly ? all.filter((r) => changedRows.value.has(r.i)) : all
})

type Row = { i: number }

const cell = (text: string, cls = ''): ReturnType<typeof h> =>
  h('div', { class: `cell ${cls}`, title: text }, text)

const header =
  (name: string, col: number): (() => ReturnType<typeof h>) =>
  () =>
    h('span', { class: 'col-head' }, [
      h('span', { class: 'mono' }, name),
      perColumn.value[col] ? h('span', { class: 'count' }, String(perColumn.value[col])) : null
    ])

const columns = computed<DataTableColumns<Row>>(() => {
  const cols: DataTableColumns<Row> = [
    {
      title: '#',
      key: '#',
      width: 60,
      fixed: 'left',
      render: (r) => h('span', { class: 'muted mono' }, String(r.i + 1))
    }
  ]
  props.original.columns.forEach((name, col) => {
    const orig = (r: Row): string => props.original.rows[r.i]?.[col] ?? ''
    const out = (r: Row): string => props.output.rows[r.i]?.[col] ?? ''
    const change = (r: Row): CellChange | undefined => byCell.value.get(`${r.i}:${col}`)

    if (props.mode === 'side' && perColumn.value[col] > 0) {
      cols.push({
        title: header(name, col),
        key: `g${col}`,
        children: [
          {
            title: 'Original',
            key: `o${col}`,
            width: 190,
            render: (r) => cell(orig(r), change(r) ? 'was' : '')
          },
          {
            title: 'Anonymised',
            key: `n${col}`,
            width: 190,
            render: (r) => cell(out(r), change(r) ? 'now' : '')
          }
        ]
      })
      return
    }
    cols.push({
      title: header(name, col),
      key: `c${col}`,
      width: props.mode === 'inline' && perColumn.value[col] > 0 ? 300 : 190,
      render: (r) => {
        const c = change(r)
        if (props.mode === 'original') return cell(orig(r), c ? 'was' : '')
        if (props.mode === 'output' || props.mode === 'side') return cell(out(r), c ? 'now' : '')
        if (!c) return cell(orig(r))
        return h('div', { class: 'cell', title: `${c.before}  →  ${c.after}` }, [
          h(DiffText, { before: c.before, after: c.after })
        ])
      }
    })
  })
  return cols
})
</script>

<template>
  <n-data-table
    :columns="columns"
    :data="rows"
    :row-key="(r: Row) => r.i"
    size="small"
    virtual-scroll
    virtual-scroll-x
    :scroll-x="columns.length * 200"
    flex-height
    style="height: 100%"
    :min-row-height="34"
  />
</template>

<style scoped>
:deep(.cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
:deep(.cell.was) {
  background: var(--del-bg);
  color: var(--del-text);
  border-radius: 3px;
  padding: 0 4px;
}
:deep(.cell.now) {
  background: var(--ins-bg);
  color: var(--ins-text);
  border-radius: 3px;
  padding: 0 4px;
}
:deep(.col-head) {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
:deep(.count) {
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 10px;
  font-size: 11px;
  padding: 0 7px;
  font-weight: 600;
}
</style>
