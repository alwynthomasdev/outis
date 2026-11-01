<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NInput,
  NSelect,
  NSwitch,
  NTabPane,
  NTabs,
  useDialog,
  useMessage
} from 'naive-ui'
import type { CustomDetector, Library } from '@core/types'
import ListEditor from '../components/ListEditor.vue'
import { label, typeOptions } from '../lib/pii'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const message = useMessage()
const dialog = useDialog()

const draft = ref<Library | null>(null)
const saved = ref('')

function load(lib: Library | null): void {
  if (!lib) return
  draft.value = JSON.parse(JSON.stringify(lib))
  saved.value = JSON.stringify(lib)
}
watch(() => app.library, load, { immediate: true })

const dirty = computed(
  () => draft.value !== null && JSON.stringify(clean(draft.value)) !== saved.value
)

function clean(lib: Library): Library {
  const tidy = (l: string[]): string[] => l.map((s) => s.trim()).filter(Boolean)
  return {
    ...lib,
    firstNames: { female: tidy(lib.firstNames.female), male: tidy(lib.firstNames.male) },
    lastNames: tidy(lib.lastNames),
    streetNames: tidy(lib.streetNames),
    streetSuffixes: tidy(lib.streetSuffixes),
    emailDomains: tidy(lib.emailDomains),
    phoneFormats: {
      mobile: tidy(lib.phoneFormats.mobile),
      landline: tidy(lib.phoneFormats.landline)
    },
    organisations: tidy(lib.organisations),
    allowList: tidy(lib.allowList),
    denyList: tidy(lib.denyList),
    towns: lib.towns.filter((t) => t.name.trim())
  }
}

async function save(): Promise<void> {
  if (!draft.value) return
  try {
    await app.saveLibrary(clean(draft.value))
    message.success('Library saved')
  } catch (e) {
    message.error((e as Error).message)
  }
}

function reset(): void {
  dialog.warning({
    title: 'Reset the PII library?',
    content:
      'All your changes to names, places, lists and custom detectors will be replaced with the defaults.',
    positiveText: 'Reset',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      app.library = await window.outis.resetLibrary()
      message.success('Library reset to defaults')
    }
  })
}

async function importLib(): Promise<void> {
  try {
    const lib = await window.outis.importLibrary()
    if (lib) {
      app.library = lib
      message.success('Library imported')
    }
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function exportLib(): Promise<void> {
  if (!draft.value) return
  const path = await window.outis.exportLibrary(JSON.parse(JSON.stringify(clean(draft.value))))
  if (path) message.success(`Exported to ${path}`)
}

// Towns are edited as "Town, AREA" lines, parsed as you type.
const townLines = ref<string[]>([])
watch(
  () => app.library,
  (lib) => (townLines.value = lib?.towns.map((t) => `${t.name}, ${t.postcodeArea}`) ?? []),
  { immediate: true }
)
watch(townLines, (lines) => {
  if (!draft.value) return
  draft.value.towns = lines
    .filter((l) => l.trim())
    .map((l) => {
      const i = l.lastIndexOf(',')
      return i > 0
        ? {
            name: l.slice(0, i).trim(),
            postcodeArea:
              l
                .slice(i + 1)
                .trim()
                .toUpperCase() || 'ZZ'
          }
        : { name: l.trim(), postcodeArea: 'ZZ' }
    })
})

// ---- custom detectors ----------------------------------------------------------

const testText = ref('Order ref ORD-123456 for customer CUS-0042.')

function addDetector(): void {
  draft.value?.customDetectors.push({
    id: Math.random().toString(36).slice(2, 10),
    name: 'New detector',
    pattern: '\\bORD-\\d{6}\\b',
    flags: 'g',
    type: 'CUSTOM',
    enabled: true
  })
}

function regexError(d: CustomDetector): string | null {
  try {
    new RegExp(d.pattern, d.flags)
    return null
  } catch (e) {
    return (e as Error).message
  }
}

function matches(d: CustomDetector): string[] {
  if (regexError(d) || !d.pattern) return []
  const re = new RegExp(d.pattern, d.flags.includes('g') ? d.flags : d.flags + 'g')
  return [...testText.value.matchAll(re)]
    .map((m) => m[0])
    .filter(Boolean)
    .slice(0, 20)
}
</script>

<template>
  <div v-if="draft" class="page lib-page">
    <div class="toolbar">
      <div>
        <h1 class="page-title">PII library</h1>
        <p class="page-sub" style="margin: 0">
          The values Outis uses to make fakes, and extra things to look for.
        </p>
      </div>
      <span class="spacer" />
      <n-button quaternary @click="importLib">Import…</n-button>
      <n-button quaternary @click="exportLib">Export…</n-button>
      <n-button quaternary @click="reset">Reset to defaults</n-button>
      <n-button type="primary" :disabled="!dirty" @click="save">Save changes</n-button>
    </div>

    <n-tabs type="line" animated>
      <n-tab-pane name="names" tab="Names">
        <div class="grid3">
          <list-editor
            v-model="draft.firstNames.female"
            title="Female first names"
            hint="A female original name gets a female fake."
          />
          <list-editor v-model="draft.firstNames.male" title="Male first names" />
          <list-editor v-model="draft.lastNames" title="Surnames" />
        </div>
      </n-tab-pane>

      <n-tab-pane name="places" tab="Places">
        <div class="grid3">
          <list-editor
            v-model="townLines"
            title="Towns"
            hint="Town, postcode area (e.g. Leeds, LS). Fake postcodes match the town."
          />
          <list-editor
            v-model="draft.streetNames"
            title="Street names"
            hint="Combined with a suffix: Oak + Avenue."
          />
          <list-editor v-model="draft.streetSuffixes" title="Street suffixes" />
        </div>
      </n-tab-pane>

      <n-tab-pane name="contact" tab="Email, phone & organisations">
        <div class="grid3">
          <list-editor
            v-model="draft.emailDomains"
            title="Email domains"
            hint="Use reserved domains (example.com, *.example, *.test) so fakes never reach real people."
          />
          <div class="stack">
            <list-editor
              v-model="draft.phoneFormats.mobile"
              title="Mobile formats"
              :rows="5"
              hint="# = random digit. Default is Ofcom's drama range."
            />
            <list-editor v-model="draft.phoneFormats.landline" title="Landline formats" :rows="7" />
          </div>
          <list-editor
            v-model="draft.organisations"
            title="Organisations"
            hint="Leave empty to generate company names."
          />
        </div>
      </n-tab-pane>

      <n-tab-pane name="lists" tab="Always / never">
        <div class="grid2">
          <list-editor
            v-model="draft.denyList"
            title="Always treat as PII"
            hint="Words or phrases replaced wherever they appear in text (e.g. project or client names)."
          />
          <list-editor
            v-model="draft.allowList"
            title="Never treat as PII"
            hint="Words the detectors should leave alone (e.g. your company name, product names)."
          />
        </div>
      </n-tab-pane>

      <n-tab-pane name="detectors" tab="Custom detectors">
        <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
          Custom detectors are regular expressions. They are used in free text and in “Scan as free
          text” columns.
        </n-alert>
        <div class="toolbar">
          <n-input v-model:value="testText" placeholder="Test text" style="flex: 1" />
          <n-button @click="addDetector">Add detector</n-button>
        </div>
        <div v-for="(d, i) in draft.customDetectors" :key="d.id" class="detector">
          <n-switch v-model:value="d.enabled" />
          <n-input v-model:value="d.name" placeholder="Name" style="width: 180px" />
          <n-input
            v-model:value="d.pattern"
            class="mono"
            placeholder="Regular expression"
            style="flex: 1"
            :status="regexError(d) ? 'error' : undefined"
          />
          <n-input v-model:value="d.flags" class="mono" placeholder="flags" style="width: 70px" />
          <n-select v-model:value="d.type" :options="typeOptions" filterable style="width: 190px" />
          <n-button quaternary @click="draft.customDetectors.splice(i, 1)">Remove</n-button>
          <div class="detector-result">
            <span v-if="regexError(d)" class="err">{{ regexError(d) }}</span>
            <span v-else-if="matches(d).length" class="muted">
              Matches: <ins v-for="(m, j) in matches(d)" :key="j" class="diff mono">{{ m }}</ins> →
              replaced as {{ label(d.type) }}
            </span>
            <span v-else class="muted">No matches in the test text.</span>
          </div>
        </div>
        <div v-if="draft.customDetectors.length === 0" class="muted">No custom detectors yet.</div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style scoped>
.grid3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.detector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  margin-bottom: 8px;
}
.detector-result {
  flex-basis: 100%;
  font-size: 12px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.detector-result ins {
  margin-right: 4px;
}
.err {
  color: var(--del-text);
}
</style>
