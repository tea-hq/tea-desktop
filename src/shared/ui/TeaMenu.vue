<script setup lang="ts">
import { computed, ref } from 'vue'
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'

export interface TeaMenuItem {
  value: string
  label: string
  icon?: string
  disabled?: boolean
  separator?: boolean
}

const props = withDefaults(
  defineProps<{
    items: TeaMenuItem[]
    popup?: boolean
    label: string
  }>(),
  { popup: false },
)
const emit = defineEmits<{ select: [value: string]; hide: [] }>()
const menu = ref<InstanceType<typeof Menu> | null>(null)
const model = computed<MenuItem[]>(() =>
  props.items.map((item) => ({
    ...item,
    command: item.separator ? undefined : () => emit('select', item.value),
  })),
)

function toggle(event: Event): void {
  menu.value?.toggle(event)
}
function show(event: Event): void {
  menu.value?.show(event)
}
function hide(): void {
  menu.value?.hide()
}

defineExpose({ toggle, show, hide })
</script>

<template>
  <Menu ref="menu" :model="model" :popup="popup" :aria-label="label" @hide="emit('hide')" />
</template>
