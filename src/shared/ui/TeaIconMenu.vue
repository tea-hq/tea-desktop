<script setup lang="ts">
import { nextTick, ref } from 'vue'
import TeaIconButton from './TeaIconButton.vue'
import TeaMenu, { type TeaMenuItem, type TeaMenuPlacement } from './TeaMenu.vue'

const props = withDefaults(
  defineProps<{
    items: TeaMenuItem[]
    label: string
    menuLabel?: string
    icon?: string
    size?: 'small' | 'default'
    disabled?: boolean
    menuPlacement?: TeaMenuPlacement
  }>(),
  {
    menuLabel: '',
    icon: 'i-mdi-dots-horizontal',
    size: 'default',
    disabled: false,
    menuPlacement: 'down',
  },
)
const emit = defineEmits<{ select: [value: string] }>()
const anchor = ref<HTMLElement | null>(null)
const menu = ref<InstanceType<typeof TeaMenu> | null>(null)
const open = ref(false)

function toggleMenu(): void {
  if (props.disabled) return
  if (open.value) {
    menu.value?.hide()
    return
  }
  open.value = true
  void nextTick(() => {
    const target = anchor.value
    if (!target) return
    menu.value?.show({ currentTarget: target, target } as unknown as Event)
  })
}

function hide(): void {
  open.value = false
  void nextTick(() => anchor.value?.querySelector('button')?.focus())
}
</script>

<template>
  <span ref="anchor" class="inline-flex">
    <TeaIconButton
      :label="label"
      :icon="icon"
      :size="size"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggleMenu"
      @pointerdown.stop
    />
    <TeaMenu
      v-if="open"
      ref="menu"
      :items="items"
      popup
      :placement="menuPlacement"
      :label="menuLabel || label"
      @select="emit('select', $event)"
      @hide="hide"
    />
  </span>
</template>
