<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { PiiType, RunSummary } from '@core/types'
import { label } from '../lib/pii'

const props = defineProps<{ summary: RunSummary; rowLabel?: string }>()

const types = computed(() =>
  (Object.entries(props.summary.byType) as [PiiType, number][]).sort((a, b) => b[1] - a[1])
)
</script>

<template>
  <div class="summary">
    <div class="stat">
      <b>{{ summary.changed.toLocaleString() }}</b> values changed
    </div>
    <div class="stat">
      <b>{{ summary.rowsAffected.toLocaleString() }}</b> {{ rowLabel ?? 'rows' }} affected
    </div>
    <div class="stat">
      <b>{{ summary.fieldsTouched }}</b> fields
    </div>
    <div class="tags">
      <n-tag v-for="[t, n] in types" :key="t" size="small" :bordered="false"
        >{{ label(t) }} · {{ n }}</n-tag
      >
    </div>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 10px;
}
.stat b {
  font-size: 16px;
}
.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
