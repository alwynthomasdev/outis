import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { FieldRule, Recipe } from '@core/types'
import type { OpenedDataset, RunResult } from '@shared/api'

/** State for the "Anonymise a file" screen. Kept in a store so it survives switching screens. */
export const useDataStore = defineStore('data', () => {
  const dataset = shallowRef<OpenedDataset | null>(null)
  const rules = ref<Record<string, FieldRule>>({})
  /** Extra JSON path patterns such as **.email (JSON only). */
  const patterns = ref<FieldRule[]>([])
  const result = shallowRef<RunResult | null>(null)
  const running = ref(false)
  const progress = ref<{ done: number; total: number } | null>(null)
  const step = ref<'rules' | 'review'>('rules')

  const format = computed(() => (dataset.value?.data.kind === 'table' ? 'csv' : 'json'))

  function suggestedRules(d: OpenedDataset): Record<string, FieldRule> {
    const out: Record<string, FieldRule> = {}
    for (const f of d.fields) {
      out[f.field] = f.suggestion
        ? { field: f.field, action: f.suggestion.action, type: f.suggestion.type }
        : { field: f.field, action: 'keep', type: 'GENERIC' }
    }
    return out
  }

  function setDataset(d: OpenedDataset | null): void {
    dataset.value = d
    result.value = null
    step.value = 'rules'
    patterns.value = []
    rules.value = d ? suggestedRules(d) : {}
  }

  function resetToSuggestions(): void {
    if (dataset.value) rules.value = suggestedRules(dataset.value)
  }

  function keepAll(): void {
    for (const r of Object.values(rules.value)) r.action = 'keep'
  }

  const activeRules = computed<FieldRule[]>(() => [
    ...Object.values(rules.value).filter((r) => r.action !== 'keep'),
    ...patterns.value.filter((p) => p.field.trim() && p.action !== 'keep')
  ])

  function toRecipe(name?: string): Recipe {
    return {
      version: 1,
      name,
      format: format.value,
      rules: activeRules.value.map((r) => ({ ...r }))
    }
  }

  /** Apply a saved recipe. Returns how many of its rules matched a field. */
  function applyRecipe(recipe: Recipe): { matched: number; patterns: number; unmatched: number } {
    let matched = 0
    let pats = 0
    let unmatched = 0
    for (const r of Object.values(rules.value)) r.action = 'keep'
    patterns.value = []
    for (const r of recipe.rules) {
      if (rules.value[r.field]) {
        rules.value[r.field] = { ...r }
        matched++
      } else if (r.field.includes('*') && format.value === 'json') {
        patterns.value.push({ ...r })
        pats++
      } else unmatched++
    }
    return { matched, patterns: pats, unmatched }
  }

  async function open(path?: string): Promise<boolean> {
    const d = await window.outis.openDataFile(path)
    if (!d) return false
    setDataset(d)
    return true
  }

  async function run(): Promise<void> {
    if (!dataset.value) return
    running.value = true
    progress.value = null
    const stop = window.outis.onProgress((p) => (progress.value = p))
    try {
      result.value = await window.outis.runRecipe(
        dataset.value.id,
        JSON.parse(JSON.stringify(activeRules.value))
      )
      step.value = 'review'
    } finally {
      stop()
      running.value = false
    }
  }

  return {
    dataset,
    rules,
    patterns,
    result,
    running,
    progress,
    step,
    format,
    activeRules,
    setDataset,
    resetToSuggestions,
    keepAll,
    toRecipe,
    applyRecipe,
    open,
    run
  }
})
