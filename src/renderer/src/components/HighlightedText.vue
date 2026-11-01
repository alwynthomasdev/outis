<script setup lang="ts">
// Text with PII spans highlighted. Click a highlight to switch it on/off.
// Selecting plain text emits `select` with its offsets so it can be marked as PII.
import { computed, ref } from 'vue'
import type { PiiType } from '@core/types'
import { label, typeColor } from '../lib/pii'

export interface Mark {
  start: number
  end: number
  type: PiiType
  on: boolean
  title?: string
  score?: number
}

const props = defineProps<{ text: string; marks: Mark[]; dark: boolean; interactive?: boolean }>()
const emit = defineEmits<{
  toggle: [index: number]
  select: [range: { start: number; end: number } | null]
}>()
const root = ref<HTMLElement | null>(null)

interface Seg {
  start: number
  text: string
  mark?: Mark
  index?: number
}

const segments = computed<Seg[]>(() => {
  const out: Seg[] = []
  const order = props.marks.map((m, i) => ({ m, i })).sort((a, b) => a.m.start - b.m.start)
  let pos = 0
  for (const { m, i } of order) {
    if (m.start < pos) continue
    if (m.start > pos) out.push({ start: pos, text: props.text.slice(pos, m.start) })
    out.push({ start: m.start, text: props.text.slice(m.start, m.end), mark: m, index: i })
    pos = m.end
  }
  if (pos < props.text.length) out.push({ start: pos, text: props.text.slice(pos) })
  return out
})

function style(m: Mark): Record<string, string> {
  const c = typeColor(m.type, props.dark)
  return m.on
    ? { background: c.bg, boxShadow: `inset 0 -2px 0 ${c.border}` }
    : { outline: `1px dashed ${c.border}` }
}

function offsetOf(node: Node | null, offset: number): number | null {
  if (!node) return null
  const el = (
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  )?.closest('[data-start]') as HTMLElement | null
  if (!el || !root.value?.contains(el)) return null
  return Number(el.dataset.start) + (node.nodeType === Node.TEXT_NODE ? offset : 0)
}

function onMouseUp(): void {
  if (!props.interactive) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) {
    emit('select', null)
    return
  }
  const a = offsetOf(sel.anchorNode, sel.anchorOffset)
  const b = offsetOf(sel.focusNode, sel.focusOffset)
  if (a === null || b === null) return
  let start = Math.min(a, b)
  let end = Math.max(a, b)
  // Trim whitespace at the ends of the selection.
  while (start < end && /\s/.test(props.text[start])) start++
  while (end > start && /\s/.test(props.text[end - 1])) end--
  emit('select', end > start ? { start, end } : null)
}
</script>

<template>
  <div ref="root" class="hl" @mouseup="onMouseUp">
    <template v-for="seg in segments" :key="seg.start">
      <mark
        v-if="seg.mark"
        :data-start="seg.start"
        :data-label="label(seg.mark.type)"
        :class="{ off: !seg.mark.on, clickable: interactive }"
        :style="style(seg.mark)"
        :title="
          seg.mark.title ??
          `${label(seg.mark.type)}${seg.mark.score !== undefined ? ` · ${Math.round(seg.mark.score * 100)}%` : ''}${interactive ? ' · click to ' + (seg.mark.on ? 'ignore' : 'replace') : ''}`
        "
        @click="interactive && emit('toggle', seg.index!)"
        >{{ seg.text }}</mark
      ><span v-else :data-start="seg.start">{{ seg.text }}</span>
    </template>
  </div>
</template>

<style scoped>
.hl {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.75;
  font-size: 14px;
}
mark {
  color: inherit;
  border-radius: 3px;
  padding: 1px 1px;
}
mark.clickable {
  cursor: pointer;
}
mark.off {
  background: transparent;
  text-decoration: line-through;
  text-decoration-color: var(--muted);
}
</style>
