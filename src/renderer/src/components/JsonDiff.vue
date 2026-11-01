<script setup lang="ts">
import { computed, h } from 'vue'
import { NDataTable, NVirtualList, type DataTableColumns } from 'naive-ui'
import type { JsonChange, JsonData } from '@core/types'
import { label } from '../lib/pii'

export type JsonMode = 'side' | 'list'

const props = defineProps<{
  original: JsonData
  output: JsonData
  changes: JsonChange[]
  mode: JsonMode
  changedOnly: boolean
}>()

// Only leaf values change, and JSON escapes newlines, so both pretty-printed versions line up.
const left = computed(() => JSON.stringify(props.original.value, null, 2).split('\n'))
const right = computed(() => JSON.stringify(props.output.value, null, 2).split('\n'))

interface Line {
  key: number
  changed: boolean
  prefix: string
  a: string
  b: string
}

const lines = computed<Line[]>(() => {
  const out: Line[] = []
  const n = Math.max(left.value.length, right.value.length)
  for (let i = 0; i < n; i++) {
    const a = left.value[i] ?? ''
    const b = right.value[i] ?? ''
    if (a === b) {
      if (!props.changedOnly) out.push({ key: i, changed: false, prefix: a, a: '', b: '' })
      continue
    }
    let p = 0
    while (p < a.length && p < b.length && a[p] === b[p]) p++
    // Start the highlight at the value, not part-way through it.
    const colon = a.lastIndexOf('": ', p)
    if (colon >= 0 && colon + 3 <= p) p = colon + 3
    out.push({ key: i, changed: true, prefix: a.slice(0, p), a: a.slice(p), b: b.slice(p) })
  }
  return out
})

const listColumns: DataTableColumns<JsonChange> = [
  { title: 'Path', key: 'path', width: 280, render: (c) => h('span', { class: 'mono' }, c.path) },
  { title: 'Type', key: 'type', width: 140, render: (c) => label(c.type) },
  {
    title: 'Original',
    key: 'before',
    render: (c) => h('span', { class: 'diff-del mono' }, c.before)
  },
  {
    title: 'Anonymised',
    key: 'after',
    render: (c) => h('span', { class: 'diff-ins mono' }, c.after)
  }
]
</script>

<template>
  <div class="json-diff">
    <template v-if="mode === 'side'">
      <div class="head">
        <span />
        <span>Original</span>
        <span>Anonymised</span>
      </div>
      <n-virtual-list class="list" :items="lines" :item-size="22" key-field="key">
        <template #default="{ item }">
          <div class="line mono" :class="{ changed: item.changed }">
            <span class="ln">{{ item.key + 1 }}</span>
            <span class="code" :title="item.changed ? item.prefix + item.a : ''"
              >{{ item.prefix }}<span v-if="item.changed" class="diff-del">{{ item.a }}</span></span
            >
            <span class="code" :title="item.changed ? item.prefix + item.b : ''"
              >{{ item.prefix }}<span v-if="item.changed" class="diff-ins">{{ item.b }}</span></span
            >
          </div>
        </template>
      </n-virtual-list>
    </template>
    <n-data-table
      v-else
      :columns="listColumns"
      :data="changes"
      :row-key="(c: JsonChange) => c.path"
      size="small"
      virtual-scroll
      flex-height
      style="height: 100%"
    />
  </div>
</template>

<style scoped>
.json-diff {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  overflow: hidden;
}
.head,
.line {
  display: grid;
  grid-template-columns: 56px 1fr 1fr;
}
.head {
  font-weight: 600;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.list {
  flex: 1;
  min-height: 0;
}
.line {
  height: 22px;
  line-height: 22px;
}
.line.changed {
  background: color-mix(in srgb, var(--accent-soft) 60%, transparent);
}
.ln {
  color: var(--muted);
  text-align: right;
  padding-right: 10px;
  user-select: none;
}
.code {
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px;
}
</style>
