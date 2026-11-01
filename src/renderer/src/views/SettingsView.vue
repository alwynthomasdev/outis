<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NButton,
  NDataTable,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSlider,
  NSwitch,
  useDialog,
  useMessage
} from 'naive-ui'
import type { Settings } from '@core/types'
import { typeOptions } from '../lib/pii'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const message = useMessage()
const dialog = useDialog()
const draft = ref<Settings | null>(null)
const showKey = ref(false)

watch(
  () => app.settings,
  (s) => {
    if (s) draft.value = JSON.parse(JSON.stringify(s))
  },
  { immediate: true }
)

const dirty = computed(
  () => draft.value && JSON.stringify(draft.value) !== JSON.stringify(app.settings)
)

async function save(): Promise<void> {
  if (!draft.value) return
  await app.saveSettings(draft.value)
  message.success('Settings saved')
}

function newKey(): void {
  dialog.warning({
    title: 'Generate a new consistency key?',
    content:
      'From now on every value will get a different fake than before. Files anonymised earlier will no longer match new ones.',
    positiveText: 'Generate new key',
    negativeText: 'Cancel',
    onPositiveClick: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(24))
      draft.value!.consistencyKey = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  })
}

async function loadModel(): Promise<void> {
  app.ner = await window.outis.warmUpNer()
  if (app.ner.error) message.error(app.ner.error)
  else if (app.ner.loaded) message.success('Model loaded')
}

async function exportMapping(): Promise<void> {
  const path = await window.outis.exportMapping()
  if (path) message.warning(`Mapping saved to ${path}. Keep it safe.`)
}

const blockedColumns = [
  { title: 'Time', key: 'time', width: 200 },
  { title: 'From', key: 'source', width: 120 },
  { title: 'Address', key: 'url', ellipsis: { tooltip: true } }
]
</script>

<template>
  <div v-if="draft" class="page settings">
    <div class="toolbar">
      <h1 class="page-title">Settings</h1>
      <span class="spacer" />
      <n-button type="primary" :disabled="!dirty" @click="save">Save settings</n-button>
    </div>

    <section>
      <h3>Consistency</h3>
      <p class="muted">
        Fakes are derived from this secret key, so the same value always gets the same fake, across
        files and sessions. Share the key with a colleague to get matching results. Keep it private:
        with the key and a guess at the original, someone could confirm the guess.
      </p>
      <div class="row">
        <n-input
          v-model:value="draft.consistencyKey"
          :type="showKey ? 'text' : 'password'"
          class="mono"
          style="max-width: 520px"
        />
        <n-button @click="showKey = !showKey">{{ showKey ? 'Hide' : 'Show' }}</n-button>
        <n-button @click="newKey">New key…</n-button>
      </div>
      <div class="row" style="margin-top: 10px">
        <n-button @click="exportMapping">Export original → fake mapping…</n-button>
        <span class="muted small">Contains the original data. Off by default for a reason.</span>
      </div>
    </section>

    <section>
      <h3>Files</h3>
      <label class="row"
        ><n-switch v-model:value="draft.csvHasHeader" /> CSV files have a header row</label
      >
    </section>

    <section>
      <h3>Free text defaults</h3>
      <div class="form">
        <label class="row"><n-switch v-model:value="draft.text.useNer" /> Use the ML model</label>
        <div>
          <div class="small">
            ML confidence threshold: {{ Math.round(draft.text.nerThreshold * 100) }}%
          </div>
          <n-slider
            v-model:value="draft.text.nerThreshold"
            :min="0.3"
            :max="0.99"
            :step="0.01"
            style="max-width: 360px"
          />
        </div>
        <div>
          <div class="small">Replace with</div>
          <n-radio-group v-model:value="draft.text.action" size="small">
            <n-radio-button value="fake">Realistic fakes</n-radio-button>
            <n-radio-button value="redact">[LABELS]</n-radio-button>
            <n-radio-button value="mask">****</n-radio-button>
          </n-radio-group>
        </div>
        <div>
          <div class="small">Look for</div>
          <n-select
            v-model:value="draft.text.enabledTypes"
            multiple
            :options="typeOptions"
            style="max-width: 720px"
          />
        </div>
      </div>
    </section>

    <section>
      <h3>ML model</h3>
      <p v-if="app.ner" class="muted">
        <span class="mono">{{ app.ner.modelId }}</span> ·
        {{
          !app.ner.installed
            ? 'not installed'
            : app.ner.error
              ? `error: ${app.ner.error}`
              : app.ner.loaded
                ? 'loaded'
                : 'installed, not loaded yet'
        }}
      </p>
      <p v-if="app.ner && !app.ner.installed" class="muted">
        Without the model, names in free text are found with titles (Mr, Dr…) and the name list
        only. Developers: run
        <code>npm run fetch-model</code>. Release builds include the model.
      </p>
      <n-button :disabled="!app.ner?.installed" @click="loadModel">Load model now</n-button>
      <p class="muted small">
        Model folder: <span class="mono">{{ app.info?.modelDir }}</span>
      </p>
    </section>

    <section>
      <h3>Network guard</h3>
      <p class="muted">
        Outis never uses the internet. That isn't automatic, though: it runs on a computer that is
        online, and the software it's built on (Chromium, plus third-party code libraries) can try
        to connect on its own, for example to check for updates or download files. The network guard
        stops this. Any attempt to reach the internet from Outis, or from its background worker, is
        blocked before it leaves your computer, so your data can't be sent anywhere.
      </p>
      <p class="muted">
        Blocked attempts since Outis started are listed below. This list should stay empty. An entry
        here means something tried to connect and was stopped. Nothing was sent, but please report
        it as an issue on the Outis GitHub project so it can be fixed.
      </p>
      <n-data-table
        v-if="app.blocked.length"
        :columns="blockedColumns"
        :data="app.blocked"
        size="small"
        :max-height="240"
      />
      <p v-else class="ok">Nothing has tried to connect since Outis started. ✓</p>
    </section>

    <section>
      <h3>About</h3>
      <p class="muted small">
        Outis v{{ app.info?.version }}. Your library and settings are stored in
        <span class="mono">{{ app.info?.userData }}</span
        >.
      </p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  max-width: 1000px;
}
section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px 20px 16px;
  margin-bottom: 14px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.small {
  font-size: 12px;
}
.ok {
  color: #2e8b57;
}
</style>
