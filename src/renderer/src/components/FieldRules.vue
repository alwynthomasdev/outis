<script setup lang="ts">
import { computed, h } from 'vue'
import {
  NDataTable,
  NInput,
  NInputNumber,
  NSelect,
  NTag,
  NTooltip,
  type DataTableColumns
} from 'naive-ui'
import type { FieldProfile, FieldRule } from '@core/types'
import { actionOptions, label, typeOptions } from '../lib/pii'

const props = defineProps<{
  fields: FieldProfile[]
  rules: Record<string, FieldRule>
  filter: string
}>()

const rows = computed(() => {
  const q = props.filter.trim().toLowerCase()
  return props.fields.filter(
    (f) =>
      !q || f.field.toLowerCase().includes(q) || f.samples.some((s) => s.toLowerCase().includes(q))
  )
})

const needsType = (r: FieldRule): boolean => r.action === 'fake' || r.action === 'redact'

const columns = computed<DataTableColumns<FieldProfile>>(() => [
  {
    title:
      props.fields[0]?.field.includes('.') || props.fields[0]?.field.includes('[')
        ? 'Property path'
        : 'Column',
    key: 'field',
    width: 220,
    render: (f) =>
      h('div', [
        h('div', { class: 'mono', style: 'word-break: break-all' }, f.field),
        h('div', { class: 'muted', style: 'font-size: 12px' }, `${f.nonEmpty} of ${f.count} filled`)
      ])
  },
  {
    title: 'Sample values',
    key: 'samples',
    minWidth: 220,
    render: (f) =>
      h(
        'div',
        { class: 'samples' },
        f.samples.slice(0, 3).map((s) => h('div', { class: 'sample mono', title: s }, s))
      )
  },
  {
    title: 'Suggestion',
    key: 'suggestion',
    width: 170,
    render: (f) =>
      f.suggestion
        ? h(NTooltip, null, {
            trigger: () =>
              h(
                NTag,
                {
                  size: 'small',
                  type: f.suggestion!.confidence >= 0.8 ? 'success' : 'info',
                  bordered: false
                },
                () => (f.suggestion!.action === 'scan' ? 'Free text' : label(f.suggestion!.type))
              ),
            default: () =>
              `${f.suggestion!.reason} (${Math.round(f.suggestion!.confidence * 100)}% confident)`
          })
        : h('span', { class: 'muted' }, 'Nothing found')
  },
  {
    title: 'Action',
    key: 'action',
    width: 190,
    render: (f) => {
      const r = props.rules[f.field]
      return h(NSelect, {
        size: 'small',
        value: r.action,
        options: actionOptions,
        'onUpdate:value': (v: FieldRule['action']) => (r.action = v)
      })
    }
  },
  {
    title: 'Replace as',
    key: 'type',
    width: 220,
    render: (f) => {
      const r = props.rules[f.field]
      if (r.action === 'constant')
        return h(NInput, {
          size: 'small',
          value: r.constant ?? '',
          placeholder: 'Value',
          'onUpdate:value': (v: string) => (r.constant = v)
        })
      if (r.action === 'mask')
        return h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
          h('span', { class: 'muted' }, 'Show last'),
          h(NInputNumber, {
            size: 'small',
            value: r.maskKeep ?? 4,
            min: 0,
            max: 20,
            style: 'width: 90px',
            'onUpdate:value': (v: number | null) => (r.maskKeep = v ?? 0)
          })
        ])
      if (!needsType(r)) return h('span', { class: 'muted' }, '—')
      return h(NSelect, {
        size: 'small',
        value: r.type,
        filterable: true,
        options: typeOptions,
        'onUpdate:value': (v: FieldRule['type']) => (r.type = v)
      })
    }
  }
])

const rowClass = (f: FieldProfile): string =>
  props.rules[f.field]?.action !== 'keep' ? 'active-rule' : ''
</script>

<template>
  <n-data-table
    :columns="columns"
    :data="rows"
    :row-key="(f: FieldProfile) => f.field"
    :row-class-name="rowClass"
    :bordered="false"
    size="small"
    flex-height
    style="height: 100%"
  />
</template>

<style scoped>
:deep(.samples) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 100%;
}
:deep(.sample) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}
:deep(.active-rule td:first-child) {
  box-shadow: inset 3px 0 0 var(--accent);
}
</style>
