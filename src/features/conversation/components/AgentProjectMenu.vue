<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaMenu } from '@/shared/ui'
import type { TeaMenuItem } from '@/shared/ui'

const NEW_PROJECT = '__new_project__'
const NO_PROJECT = '__no_project__'

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    projects?: string[]
    label: string
    placeholder: string
    newProjectLabel: string
    disabled?: boolean
  }>(),
  { modelValue: null, projects: () => [], disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  'new-project': []
}>()

const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<InstanceType<typeof TeaMenu> | null>(null)
const open = ref(false)
const { t } = useI18n()

const projects = computed(() => {
  const unique = new Set<string>()
  return [...props.projects, props.modelValue ?? ''].filter((project) => {
    const normalized = project.trim()
    if (!normalized || unique.has(normalized)) return false
    unique.add(normalized)
    return true
  })
})

const selectedLabel = computed(() =>
  props.modelValue ? projectName(props.modelValue) : props.placeholder,
)

const menuItems = computed<TeaMenuItem[]>(() => {
  const projectItems = projects.value.map((project) => ({
    value: project,
    label: projectName(project),
    title: project,
    icon: 'i-mdi-folder-outline',
    selected: project === props.modelValue,
  }))
  return [
    ...(props.modelValue
      ? [
          {
            value: NO_PROJECT,
            label: t('composer.noProject'),
            icon: 'i-mdi-folder-off-outline',
          },
          { value: '__separator__', label: '', separator: true },
        ]
      : []),
    ...projectItems,
    ...(projectItems.length > 0 ? [{ value: '__separator__', label: '', separator: true }] : []),
    {
      value: NEW_PROJECT,
      label: props.newProjectLabel,
      icon: 'i-mdi-folder-plus-outline',
    },
  ]
})

function projectName(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, '')
  return normalized.split(/[\\/]/u).at(-1) || normalized || path
}

function showMenu(): void {
  if (props.disabled) return
  open.value = true
  void nextTick(() => {
    const anchor = trigger.value
    if (anchor) menu.value?.show({ currentTarget: anchor, target: anchor } as unknown as Event)
  })
}

function toggleMenu(): void {
  if (open.value) menu.value?.hide()
  else showMenu()
}

function selectValue(value: string): void {
  if (value === NO_PROJECT) {
    emit('update:modelValue', null)
    menu.value?.hide()
    return
  }
  if (value === NEW_PROJECT) {
    emit('new-project')
    menu.value?.hide()
    return
  }
  if (value === '__separator__') return
  emit('update:modelValue', value)
  menu.value?.hide()
}

function hide(): void {
  open.value = false
  void nextTick(() => trigger.value?.focus())
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
    event.preventDefault()
    showMenu()
  }
}
</script>

<template>
  <div class="agent-project-menu min-w-0">
    <button
      ref="trigger"
      type="button"
      role="combobox"
      aria-haspopup="menu"
      :aria-label="label"
      :aria-expanded="open"
      :disabled="disabled"
      :title="modelValue || placeholder"
      class="agent-context-pill inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-control border border-transparent bg-transparent px-2.5 text-left text-sm text-dim outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-disabled"
      @click="toggleMenu"
      @pointerdown.stop
      @keydown="handleKeydown"
    >
      <span class="i-mdi-folder-outline size-4 shrink-0 text-subtle" aria-hidden="true" />
      <span class="min-w-0 truncate">{{ selectedLabel }}</span>
      <span class="i-mdi-chevron-down size-4 shrink-0 text-subtle" aria-hidden="true" />
    </button>
    <TeaMenu
      v-if="open"
      ref="menu"
      :items="menuItems"
      popup
      placement="up"
      :label="label"
      @select="selectValue"
      @hide="hide"
    />
  </div>
</template>
