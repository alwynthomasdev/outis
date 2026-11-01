<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NCheckbox,
  NInput,
  NPopover,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSlider,
  NSwitch,
  NTag,
  useMessage,
  useOsTheme
} from 'naive-ui'
import type { PiiType, Span, TextOptions, TextResult } from '@core/types'
import HighlightedText, { type Mark } from '../components/HighlightedText.vue'
import { label, typeColor, typeOptions } from '../lib/pii'
import { useAppStore } from '../stores/app'

const SAMPLE = `Hi team,

Following up on yesterday's call with Sarah Jenkins (sarah.jenkins@gmail.com, 07700 900123). She lives at
14 Oak Avenue, Leeds LS6 2AB and asked us to update her NI number to AB 12 34 56 C.

Her husband Tom O'Neill works for Barclays in Manchester and can be reached on +44 161 496 0782.
Payment was taken from card 4111 1111 1111 1111. NHS number 943 476 5919. Date of birth 12/03/1985.

Mrs Jenkins said the login issue came from IP 81.2.69.160.

Thanks,
Dr Priya Shah`

const app = useAppStore()
const message = useMessage()
const os = useOsTheme()
const dark = computed(() => os.value === 'dark')

const text = ref('')
const fileName = ref('text.txt')
const mode = ref<'edit' | 'review'>('edit')
const spans = ref<(Span & { on: boolean })[]>([])
const result = ref<TextResult | null>(null)
const detecting = ref(false)
const view = ref<'output' | 'inline'>('output')
const selection = ref<{ start: number; end: number } | null>(null)
const newType = ref<PiiType>('PERSON')
const allOccurrences = ref(true)

const options = ref<TextOptions>({
  enabledTypes: [],
  nerThreshold: 0.6,
  useNer: true,
  action: 'fake'
})
watch(
  () => app.settings,
  (s) => {
    if (s) options.value = JSON.parse(JSON.stringify(s.text))
  },
  { immediate: true }
)

const nerAvailable = computed(() => app.ner?.installed && !app.ner?.error)

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    message.error(
      (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    )
    return undefined
  }
}

async function detect(): Promise<void> {
  if (!text.value.trim()) return
  detecting.value = true
  try {
    const found = await guard(() =>
      window.outis.detectText(text.value, JSON.parse(JSON.stringify(options.value)))
    )
    if (!found) return
    spans.value = found.map((s) => ({ ...s, on: true }))
    mode.value = 'review'
    selection.value = null
    await refresh()
    if (options.value.useNer) void app.refreshNer()
  } finally {
    detecting.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
async function refresh(): Promise<void> {
  const accepted = spans.value
    .filter((s) => s.on)
    .map((s) => ({
      start: s.start,
      end: s.end,
      type: s.type,
      text: s.text,
      score: s.score,
      source: s.source,
      detector: s.detector
    }))
  result.value =
    (await guard(() => window.outis.anonymiseText(text.value, accepted, options.value.action))) ??
    null
}
function refreshSoon(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(refresh, 120)
}

function toggle(i: number): void {
  spans.value[i].on = !spans.value[i].on
  refreshSoon()
}

function setType(type: PiiType, on: boolean): void {
  for (const s of spans.value) if (s.type === type) s.on = on
  refreshSoon()
}

function addSelection(): void {
  const sel = selection.value
  if (!sel) return
  const value = text.value.slice(sel.start, sel.end)
  const ranges = [sel]
  if (allOccurrences.value) {
    let i = text.value.indexOf(value)
    while (i !== -1) {
      if (i !== sel.start) ranges.push({ start: i, end: i + value.length })
      i = text.value.indexOf(value, i + value.length)
    }
  }
  for (const r of ranges) {
    // A manual mark replaces anything it overlaps.
    spans.value = spans.value.filter((s) => s.end <= r.start || s.start >= r.end)
    spans.value.push({
      ...r,
      type: newType.value,
      text: value,
      score: 1,
      source: 'user',
      detector: 'manual',
      on: true
    })
  }
  spans.value.sort((a, b) => a.start - b.start)
  selection.value = null
  window.getSelection()?.removeAllRanges()
  refreshSoon()
}

const inputMarks = computed<Mark[]>(() =>
  spans.value.map((s) => ({ start: s.start, end: s.end, type: s.type, on: s.on, score: s.score }))
)
const outputMarks = computed<Mark[]>(() =>
  (result.value?.replacements ?? []).map((r) => ({
    start: r.outStart,
    end: r.outEnd,
    type: r.type,
    on: true,
    title: `was: ${r.before}`
  }))
)

/** Original text with each replacement shown as removed → added. */
const inlineParts = computed(() => {
  const parts: { kind: 'same' | 'del' | 'ins'; text: string }[] = []
  if (!result.value) return parts
  let pos = 0
  for (const r of result.value.replacements) {
    if (r.start > pos) parts.push({ kind: 'same', text: text.value.slice(pos, r.start) })
    parts.push({ kind: 'del', text: r.before }, { kind: 'ins', text: r.after })
    pos = r.end
  }
  parts.push({ kind: 'same', text: text.value.slice(pos) })
  return parts
})

const typeCounts = computed(() => {
  const m = new Map<PiiType, { total: number; on: number }>()
  for (const s of spans.value) {
    const c = m.get(s.type) ?? { total: 0, on: 0 }
    c.total++
    if (s.on) c.on++
    m.set(s.type, c)
  }
  return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
})

async function openFile(): Promise<void> {
  const f = await guard(() => window.outis.openTextFile())
  if (!f) return
  text.value = f.text
  fileName.value = f.name
  mode.value = 'edit'
  result.value = null
  spans.value = []
}

async function copyOutput(): Promise<void> {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value.output)
  message.success('Copied')
}

async function saveOutput(): Promise<void> {
  if (!result.value) return
  const saved = await guard(() => window.outis.saveText(result.value!.output, fileName.value))
  if (saved) message.success(`Saved ${saved}`)
}

function loadSample(): void {
  text.value = SAMPLE
  mode.value = 'edit'
}

function edit(): void {
  mode.value = 'edit'
  selection.value = null
}

// Re-run detection when options change during review.
watch(
  () => [options.value.useNer, options.value.nerThreshold, options.value.enabledTypes.join()],
  () => {
    if (mode.value === 'review') void detect()
  }
)
watch(
  () => options.value.action,
  () => mode.value === 'review' && refreshSoon()
)
</script>

<template>
  <div class="page text-page">
    <div class="toolbar">
      <div>
        <h1 class="page-title">Anonymise text</h1>
      </div>
      <span class="spacer" />
      <n-button quaternary @click="openFile">Open file…</n-button>
      <n-button quaternary @click="loadSample">Try a sample</n-button>
      <n-popover trigger="click" placement="bottom-end" :width="360">
        <template #trigger>
          <n-button quaternary>Detection options</n-button>
        </template>
        <div class="opts">
          <label class="row">
            <n-switch v-model:value="options.useNer" :disabled="!nerAvailable" />
            Use ML model for names, places and organisations
          </label>
          <div v-if="!nerAvailable" class="muted small">
            Model not installed: using rules and the name dictionary only.
          </div>
          <div>
            <div class="small">
              ML confidence threshold: {{ Math.round(options.nerThreshold * 100) }}%
            </div>
            <n-slider
              v-model:value="options.nerThreshold"
              :min="0.3"
              :max="0.99"
              :step="0.01"
              :disabled="!options.useNer"
            />
          </div>
          <div>
            <div class="small">Replace with</div>
            <n-radio-group v-model:value="options.action" size="small">
              <n-radio-button value="fake">Realistic fakes</n-radio-button>
              <n-radio-button value="redact">[LABELS]</n-radio-button>
              <n-radio-button value="mask">****</n-radio-button>
            </n-radio-group>
          </div>
          <div>
            <div class="small">Look for</div>
            <n-select
              v-model:value="options.enabledTypes"
              multiple
              :options="typeOptions"
              max-tag-count="responsive"
              size="small"
            />
          </div>
          <div class="muted small">Defaults can be changed in Settings.</div>
        </div>
      </n-popover>
      <n-button v-if="mode === 'review'" @click="edit">Edit text</n-button>
      <n-button type="primary" :loading="detecting" :disabled="!text.trim()" @click="detect">
        {{ mode === 'review' ? 'Detect again' : 'Find PII →' }}
      </n-button>
    </div>

    <div class="panes">
      <section class="pane">
        <div class="pane-head">
          <b>Original</b>
          <span v-if="mode === 'review'" class="muted small"
            >Click a highlight to ignore it. Select text to mark it.</span
          >
        </div>
        <n-input
          v-if="mode === 'edit'"
          v-model:value="text"
          type="textarea"
          placeholder="Paste text here, open a file, or try the sample."
          class="editor"
          :autosize="false"
        />
        <div v-else class="pane-body">
          <highlighted-text
            :text="text"
            :marks="inputMarks"
            :dark="dark"
            interactive
            @toggle="toggle"
            @select="selection = $event"
          />
        </div>
        <div v-if="mode === 'review' && selection" class="mark-bar">
          <span class="mono sel">“{{ text.slice(selection.start, selection.end) }}”</span>
          <n-select
            v-model:value="newType"
            :options="typeOptions"
            size="small"
            filterable
            style="width: 180px"
          />
          <n-checkbox v-model:checked="allOccurrences">All occurrences</n-checkbox>
          <n-button size="small" type="primary" @click="addSelection">Mark as PII</n-button>
        </div>
      </section>

      <section class="pane">
        <div class="pane-head">
          <b>Anonymised</b>
          <n-radio-group v-model:value="view" size="small">
            <n-radio-button value="output">Result</n-radio-button>
            <n-radio-button value="inline">Changes</n-radio-button>
          </n-radio-group>
          <span class="spacer" />
          <n-button size="small" :disabled="!result" @click="copyOutput">Copy</n-button>
          <n-button size="small" :disabled="!result" @click="saveOutput">Save as…</n-button>
        </div>
        <div class="pane-body">
          <div v-if="!result" class="muted empty">
            Press “Find PII” to see the anonymised text here.
          </div>
          <highlighted-text
            v-else-if="view === 'output'"
            :text="result.output"
            :marks="outputMarks"
            :dark="dark"
          />
          <div v-else class="inline">
            <template v-for="(p, i) in inlineParts" :key="i">
              <del v-if="p.kind === 'del'" class="diff">{{ p.text }}</del>
              <ins v-else-if="p.kind === 'ins'" class="diff">{{ p.text }}</ins>
              <span v-else>{{ p.text }}</span>
            </template>
          </div>
        </div>
      </section>
    </div>

    <div v-if="mode === 'review'" class="legend">
      <n-alert v-if="spans.length === 0" type="info" :bordered="false"
        >No PII found. Select text in the left pane to mark it by hand.</n-alert
      >
      <n-tag
        v-for="[t, c] in typeCounts"
        :key="t"
        :bordered="false"
        :style="{ background: typeColor(t, dark).bg, cursor: 'pointer' }"
        :title="c.on ? 'Click to ignore all' : 'Click to replace all'"
        @click="setType(t, c.on === 0)"
      >
        {{ label(t) }} · {{ c.on }}/{{ c.total }}
      </n-tag>
    </div>
  </div>
</template>

<style scoped>
.text-page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.pane-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.pane-body {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
}
.editor {
  flex: 1;
  border-radius: 0;
}
.editor :deep(textarea) {
  height: 100% !important;
}
.editor :deep(.n-input-wrapper) {
  height: 100%;
}
.inline {
  white-space: pre-wrap;
  line-height: 1.75;
}
.empty {
  padding: 30px 0;
  text-align: center;
}
.mark-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--accent-soft);
}
.sel {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legend {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 10px;
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.small {
  font-size: 12px;
}
.spacer {
  flex: 1;
}
</style>
