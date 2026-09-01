<script setup lang="ts">
import { computed } from 'vue'

export interface TeaTabOption {
  value: string
  label: string
  disabled?: boolean
}

const props = defineProps<{ modelValue: string; tabs: TeaTabOption[]; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const tabId = `tea-tabs-${Math.random().toString(36).slice(2)}`
const enabledTabs = computed(() => props.tabs.filter((tab) => !tab.disabled))

function select(value: string): void {
  if (props.tabs.some((tab) => tab.value === value && !tab.disabled))
    emit('update:modelValue', value)
}

function handleKeydown(event: KeyboardEvent, value: string): void {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  if (enabledTabs.value.length === 0) return
  const index = Math.max(
    0,
    enabledTabs.value.findIndex((tab) => tab.value === value),
  )
  const nextIndex =
    event.key === 'ArrowRight'
      ? (index + 1) % enabledTabs.value.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + enabledTabs.value.length) % enabledTabs.value.length
        : event.key === 'Home'
          ? 0
          : enabledTabs.value.length - 1
  const next = enabledTabs.value[nextIndex]
  if (next) select(next.value)
}
</script>

<template>
  <div>
    <div class="nav-pill-group" role="tablist" :aria-label="label">
      <button
        v-for="tab in tabs"
        :id="`${tabId}-${tab.value}`"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.value"
        :aria-controls="`${tabId}-panel-${tab.value}`"
        :tabindex="modelValue === tab.value ? 0 : -1"
        :disabled="tab.disabled"
        class="nav-pill-group__item"
        @click="select(tab.value)"
        @keydown="handleKeydown($event, tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      v-for="tab in tabs"
      :id="`${tabId}-panel-${tab.value}`"
      :key="`panel-${tab.value}`"
      role="tabpanel"
      :aria-labelledby="`${tabId}-${tab.value}`"
      :hidden="modelValue !== tab.value"
      class="pt-4"
    >
      <slot :name="tab.value" />
    </div>
  </div>
</template>
