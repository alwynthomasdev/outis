<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NAlert,
  NButton,
  NInput,
  NModal,
  NProgress,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSwitch,
  useMessage
} from 'naive-ui'
import type { CellChange, JsonChange, JsonData, TableData } from '@core/types'
import FieldRules from '../components/FieldRules.vue'
import JsonDiff, { type JsonMode } from '../components/JsonDiff.vue'
import SummaryBar from '../components/SummaryBar.vue'
import TableDiff, { type TableMode } from '../components/TableDiff.vue'
import { actionOptions, typeOptions } from '../lib/pii'
import { useDataStore } from '../stores/data'

const store = useDataStore()
const message = useMessage()
const dragging = ref(false)
const filter = ref('')
const tableMode = ref<TableMode>('inline')
const jsonMode = ref<JsonMode>('side')
const changedOnly = ref(false)

const ds = computed(() => store.dataset)
const isTable = computed(() => ds.value?.data.kind === 'table')
const recordCount = computed(() => {
  const d = ds.value?.data
  if (!d) return 0
  if (d.kind === 'table') return d.rows.length
  return Array.isArray(d.value) ? d.value.length : 1
})
const activeCount = computed(() => store.activeRules.length)

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    const msg = (e as Error).message.replace(
      /^Error invoking remote method '[^']+': (Error: )?/,
      ''
    )
    if (msg !== 'Cancelled') message.error(msg, { duration: 6000 })
    return undefined
  }
}

const open = (path?: string): Promise<unknown> => guard(() => store.open(path))

function onDrop(e: DragEvent): void {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void open(window.outis.pathForFile(file))
}

async function run(): Promise<void> {
  await guard(() => store.run())
}

async function exportFile(): Promise<void> {
  if (!ds.value) return
  const saved = await guard(() => window.outis.exportDataset(ds.value!.id, ds.value!.name))
  if (saved) message.success(`Saved ${saved}`)
}

async function saveRecipe(): Promise<void> {
  const name = ds.value?.name.replace(/\.[^.]+$/, '')
  const saved = await guard(() => window.outis.saveRecipe(store.toRecipe(name)))
  if (saved) message.success('Recipe saved')
}

async function loadRecipe(): Promise<void> {
  const recipe = await guard(() => window.outis.loadRecipe())
  if (!recipe) return
  const r = store.applyRecipe(recipe)
  message.info(
    `Recipe applied: ${r.matched} field(s) matched` +
      (r.patterns ? `, ${r.patterns} path pattern(s)` : '') +
      (r.unmatched ? `, ${r.unmatched} not found in this file` : '')
  )
}

function cancel(): void {
  void guard(() => window.outis.cancelRun())
}

function addPattern(): void {
  store.patterns.push({ field: '**.', action: 'fake', type: 'EMAIL' })
}

const progressPct = computed(() =>
  store.progress && store.progress.total
    ? Math.round((store.progress.done / store.progress.total) * 100)
    : 0
)
</script>

<template>
  <div class="page data-page">
    <!-- 1. Nothing open -->
    <template v-if="!ds">
      <h1 class="page-title">Anonymise a file</h1>
      <p class="page-sub">CSV, TSV, JSON or JSON Lines. The original file is never changed.</p>
      <div
        class="drop"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="drop-title">Drop a file here</div>
        <div class="muted">or</div>
        <n-button type="primary" size="large" @click="open()">Choose a file…</n-button>
      </div>
    </template>

    <!-- 2. File open -->
    <template v-else>
      <div class="toolbar">
        <div>
          <div class="file-name">{{ ds.name }}</div>
          <div class="muted small">
            {{ isTable ? 'CSV' : (ds.data as JsonData).jsonl ? 'JSON Lines' : 'JSON' }} ·
            {{ recordCount.toLocaleString() }} {{ isTable ? 'rows' : 'records' }} ·
            {{ ds.fields.length }}
            {{ isTable ? 'columns' : 'properties' }}
          </div>
        </div>
        <span class="spacer" />
        <n-button quaternary @click="loadRecipe">Load recipe</n-button>
        <n-button quaternary @click="saveRecipe">Save recipe</n-button>
        <n-button quaternary @click="store.setDataset(null)">Close file</n-button>
      </div>

      <div class="steps">
        <button class="step" :class="{ on: store.step === 'rules' }" @click="store.step = 'rules'">
          1. Choose what to replace
        </button>
        <button
          class="step"
          :class="{ on: store.step === 'review' }"
          :disabled="!store.result"
          @click="store.step = 'review'"
        >
          2. Review changes
        </button>
      </div>

      <!-- Rules -->
      <div v-show="store.step === 'rules'" class="panel-fill">
        <div class="toolbar">
          <n-input
            v-model:value="filter"
            placeholder="Filter fields…"
            clearable
            size="small"
            style="width: 220px"
          />
          <n-button size="small" @click="store.resetToSuggestions()">Use suggestions</n-button>
          <n-button size="small" @click="store.keepAll()">Keep everything</n-button>
          <n-button v-if="!isTable" size="small" @click="addPattern">Add path pattern</n-button>
          <span class="spacer" />
          <span class="muted">{{ activeCount }} rule(s) active</span>
          <n-button
            type="primary"
            :disabled="activeCount === 0"
            :loading="store.running"
            @click="run"
            >Anonymise →</n-button
          >
        </div>
        <div v-if="!isTable && store.patterns.length" class="patterns">
          <div class="muted small">
            Path patterns apply to every matching property. <code>*</code> = any one key,
            <code>**.</code> = any depth, <code>[*]</code> = any array item. Exact field rules take
            priority.
          </div>
          <div v-for="(p, i) in store.patterns" :key="i" class="pattern-row">
            <n-input
              v-model:value="p.field"
              size="small"
              class="mono"
              placeholder="**.email"
              style="width: 260px"
            />
            <n-select
              v-model:value="p.action"
              size="small"
              :options="actionOptions"
              style="width: 190px"
            />
            <n-select
              v-model:value="p.type"
              size="small"
              filterable
              :options="typeOptions"
              style="width: 200px"
            />
            <n-button size="small" quaternary @click="store.patterns.splice(i, 1)">Remove</n-button>
          </div>
        </div>
        <div class="fill">
          <field-rules :fields="ds.fields" :rules="store.rules" :filter="filter" />
        </div>
      </div>

      <!-- Review -->
      <div v-if="store.step === 'review' && store.result" class="panel-fill">
        <summary-bar :summary="store.result.summary" :row-label="isTable ? 'rows' : 'records'" />
        <div class="toolbar">
          <n-radio-group v-if="isTable" v-model:value="tableMode" size="small">
            <n-radio-button value="inline">Inline changes</n-radio-button>
            <n-radio-button value="side">Side by side</n-radio-button>
            <n-radio-button value="original">Original</n-radio-button>
            <n-radio-button value="output">Anonymised</n-radio-button>
          </n-radio-group>
          <n-radio-group v-else v-model:value="jsonMode" size="small">
            <n-radio-button value="side">Side by side</n-radio-button>
            <n-radio-button value="list">List of changes</n-radio-button>
          </n-radio-group>
          <label v-if="isTable || jsonMode === 'side'" class="switch"
            ><n-switch v-model:value="changedOnly" size="small" /> Changed
            {{ isTable ? 'rows' : 'lines' }} only</label
          >
          <span class="spacer" />
          <n-button @click="store.step = 'rules'">← Change rules</n-button>
          <n-button type="primary" @click="exportFile">Export anonymised file…</n-button>
        </div>
        <n-alert
          v-if="store.result.summary.changed === 0"
          type="warning"
          :bordered="false"
          style="margin-bottom: 10px"
        >
          Nothing was changed. Check the rules in step 1.
        </n-alert>
        <div class="fill">
          <table-diff
            v-if="isTable"
            :original="ds.data as TableData"
            :output="store.result.output as TableData"
            :changes="store.result.changes as CellChange[]"
            :mode="tableMode"
            :changed-only="changedOnly"
          />
          <json-diff
            v-else
            :original="ds.data as JsonData"
            :output="store.result.output as JsonData"
            :changes="store.result.changes as JsonChange[]"
            :mode="jsonMode"
            :changed-only="changedOnly"
          />
        </div>
      </div>
    </template>

    <n-modal :show="store.running" :mask-closable="false">
      <div class="progress-card">
        <div class="file-name">Anonymising…</div>
        <n-progress type="line" :percentage="progressPct" :show-indicator="true" processing />
        <div class="muted small">
          {{
            store.progress
              ? `${store.progress.done.toLocaleString()} of ${store.progress.total.toLocaleString()} values`
              : 'Starting…'
          }}
        </div>
        <n-button size="small" @click="cancel">Cancel</n-button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.data-page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.drop {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 70px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: var(--panel);
  max-width: 760px;
}
.drop.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.drop-title {
  font-size: 18px;
  font-weight: 600;
}
.file-name {
  font-weight: 600;
  font-size: 16px;
}
.small {
  font-size: 12px;
}
.steps {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.step {
  all: unset;
  cursor: pointer;
  padding: 8px 14px;
  border-bottom: 2px solid transparent;
  color: var(--muted);
}
.step.on {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.step:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.panel-fill {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fill {
  flex: 1;
  min-height: 0;
}
.patterns {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
}
.pattern-row {
  display: flex;
  gap: 8px;
}
.switch {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.progress-card {
  background: var(--panel);
  padding: 22px;
  border-radius: 10px;
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
