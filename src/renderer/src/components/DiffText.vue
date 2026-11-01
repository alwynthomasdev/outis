<script setup lang="ts">
// Shows a before → after change. Short values are shown whole; longer ones as a word diff.
import { computed } from 'vue'
import { diffWordsWithSpace } from 'diff'

const props = defineProps<{ before: string; after: string }>()

const parts = computed(() => {
  if (props.before.length < 24 && props.after.length < 24) return null
  return diffWordsWithSpace(props.before, props.after)
})
</script>

<template>
  <span v-if="!parts"
    ><del class="diff">{{ before }}</del> <ins class="diff">{{ after }}</ins></span
  >
  <span v-else>
    <template v-for="(p, i) in parts" :key="i">
      <del v-if="p.removed" class="diff">{{ p.value }}</del>
      <ins v-else-if="p.added" class="diff">{{ p.value }}</ins>
      <span v-else>{{ p.value }}</span>
    </template>
  </span>
</template>
