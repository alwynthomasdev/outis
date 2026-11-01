<script setup lang="ts">
// Edit a list of strings as one item per line.
import { computed } from 'vue'
import { NInput } from 'naive-ui'

const props = defineProps<{ modelValue: string[]; title: string; hint?: string; rows?: number }>()
const emit = defineEmits<{ 'update:modelValue': [v: string[]] }>()

const text = computed({
  get: () => props.modelValue.join('\n'),
  // Lines are kept exactly as typed; blank lines and spaces are tidied when the library is saved.
  set: (v: string) => emit('update:modelValue', v.split(/\r?\n/))
})
const count = computed(() => props.modelValue.filter((s) => s.trim()).length)
</script>

<template>
  <div class="list-editor">
    <div class="head">
      <b>{{ title }}</b>
      <span class="muted">{{ count }}</span>
    </div>
    <div v-if="hint" class="muted hint">{{ hint }}</div>
    <n-input
      v-model:value="text"
      type="textarea"
      :rows="rows ?? 14"
      class="mono"
      placeholder="One per line"
    />
  </div>
</template>

<style scoped>
.list-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.head {
  display: flex;
  justify-content: space-between;
}
.hint {
  font-size: 12px;
}
</style>
