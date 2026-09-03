<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton } from '@/shared/ui'
import type { TeaSelectOption } from '@/shared/ui'
import { calculateFloatingMenuPosition } from '@/shared/ui/menuPosition'
import type { RuntimeDescriptor, ThinkingEffort } from '../contracts'
import RuntimeIcon from '../../../shared/ui/RuntimeIcon.vue'

type MenuSection = 'model' | 'effort'
type ModelMenuInput = TeaSelectOption<string> & {
  providerId?: string
}
type NormalizedModelOption = TeaSelectOption<string> & {
  providerId: string
  providerLabel: string | null
}
type ModelGroup = {
  providerId: string
  providerLabel: string | null
  options: NormalizedModelOption[]
}

const EFFORT_VALUES: ThinkingEffort[] = ['light', 'medium', 'high', 'extraHigh', 'ultra']

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: ModelMenuInput[]
    label: string
    runtimes?: RuntimeDescriptor[]
    runtimeId?: string | null
    allowRuntimeSelection?: boolean
    disabled?: boolean
  }>(),
  {
    runtimes: () => [],
    runtimeId: null,
    allowRuntimeSelection: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'select-runtime': [value: string]
  'select-effort': [value: ThinkingEffort]
}>()

const { t } = useI18n()
const triggerRoot = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const activeSection = ref<MenuSection>('model')
const thinkingEffort = ref<ThinkingEffort>('extraHigh')
const selectedRuntimeId = ref<string | null>(props.runtimeId)
const position = ref({ top: '0px', left: '0px' })

const runtimeSelectionEnabled = computed(
  () => props.allowRuntimeSelection && props.runtimes.length > 0,
)
const selectedRuntime = computed(
  () => props.runtimes.find((runtime) => runtime.id === selectedRuntimeId.value) ?? null,
)
const selectedRuntimeLabel = computed(
  () => selectedRuntime.value?.displayName ?? selectedRuntimeId.value ?? t('composer.selectAgent'),
)
const effortOptions = computed(() =>
  EFFORT_VALUES.map((value) => ({
    value,
    label: t(`composer.modelMenu.effortOptions.${value}`),
  })),
)
const selectedRuntimeModels = computed<NormalizedModelOption[]>(() => {
  const advertised = selectedRuntime.value?.models ?? []
  if (advertised.length > 0) {
    return advertised.map((model) =>
      normalizeModelOption({
        value: model.value,
        label: model.displayName,
        providerId: model.providerId,
      }),
    )
  }
  return props.options.map(normalizeModelOption)
})
const modelGroups = computed(() => groupModelOptions(props.options))
const selectedRuntimeModelGroups = computed(() => groupModelOptions(selectedRuntimeModels.value))
const triggerModelOptions = computed(() =>
  runtimeSelectionEnabled.value
    ? selectedRuntimeModels.value
    : modelGroups.value.flatMap((group) => group.options),
)
const selectedModelLabel = computed(
  () =>
    triggerModelOptions.value.find((option) => option.value === props.modelValue)?.label ??
    normalizeModelLabel(props.modelValue),
)

function normalizeModelOption(option: ModelMenuInput): NormalizedModelOption {
  const label = option.label.trim()
  const separator = label.indexOf('/')
  const valueProvider = providerFromValue(option.value)
  const candidateProvider =
    separator > 0 && separator < label.length - 1 ? label.slice(0, separator).trim() : ''
  const hasProviderSeparator =
    candidateProvider.length > 0 &&
    (/\s\/\s/.test(label) ||
      sameProvider(candidateProvider, option.providerId) ||
      sameProvider(candidateProvider, valueProvider))
  const labelProvider = hasProviderSeparator ? candidateProvider : ''
  const modelLabel = hasProviderSeparator ? label.slice(separator + 1).trim() : label
  const providerId = option.providerId?.trim() || valueProvider || labelProvider

  return {
    ...option,
    label: modelLabel,
    providerId: providerId || '__ungrouped__',
    providerLabel: labelProvider || providerId || null,
  }
}

function normalizeModelLabel(value: string): string {
  const separator = value.indexOf('/')
  if (separator > 0 && separator < value.length - 1) return value.slice(separator + 1).trim()
  return value.trim()
}

function providerFromValue(value: string): string {
  const slash = value.indexOf('/')
  if (slash > 0) return stripProviderNamespace(value.slice(0, slash).trim())

  const colon = value.indexOf(':')
  if (colon > 0) {
    return stripProviderNamespace(value.slice(0, colon).trim())
  }
  return ''
}

function stripProviderNamespace(value: string): string {
  return value.startsWith('center.') ? value.slice('center.'.length) : value
}

function sameProvider(left: string, right: string | undefined): boolean {
  return Boolean(right && left.toLowerCase() === right.trim().toLowerCase())
}

function groupModelOptions(
  options: readonly NormalizedModelOption[] | readonly ModelMenuInput[],
): ModelGroup[] {
  const groups = new Map<string, ModelGroup>()
  for (const input of options) {
    const option = 'providerLabel' in input ? input : normalizeModelOption(input)
    const group = groups.get(option.providerId)
    if (group) {
      group.options.push(option)
      continue
    }
    groups.set(option.providerId, {
      providerId: option.providerId,
      providerLabel: option.providerLabel,
      options: [option],
    })
  }
  return [...groups.values()]
}

function triggerButton(): HTMLButtonElement | null {
  return triggerRoot.value?.querySelector('button') ?? null
}

function updatePosition(): void {
  const anchor = triggerButton()
  if (!anchor) return

  const anchorRect = anchor.getBoundingClientRect()
  const estimatedWidth = runtimeSelectionEnabled.value ? 416 : 496
  position.value = {
    top: `${Math.max(8, anchorRect.top - 8)}px`,
    left: `${Math.max(8, anchorRect.right - estimatedWidth)}px`,
  }

  void nextTick(() => {
    const popup = panel.value
    if (!popup) return

    const nextPosition = calculateFloatingMenuPosition(
      anchorRect,
      { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { alignEnd: true, preferUp: true },
    )
    position.value = {
      top: `${nextPosition.top}px`,
      left: `${nextPosition.left}px`,
    }
  })
}

function closeMenu(restoreFocus = true): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) void nextTick(() => triggerButton()?.focus())
}

function toggleMenu(): void {
  if (props.disabled) return
  if (open.value) closeMenu(false)
  else {
    open.value = true
    activeSection.value = 'model'
  }
}

function handleTriggerKeydown(event: KeyboardEvent): void {
  if (
    event.key === 'Enter' ||
    event.key === ' ' ||
    event.key === 'ArrowDown' ||
    event.key === 'ArrowUp'
  ) {
    event.preventDefault()
    if (!open.value) toggleMenu()
  }
}

function selectModel(value: string): void {
  const option = triggerModelOptions.value.find((candidate) => candidate.value === value)
  if (!option || option.disabled) return
  emit('update:modelValue', value)
  if (runtimeSelectionEnabled.value) closeMenu()
}

function selectRuntime(value: string): void {
  const runtime = props.runtimes.find((candidate) => candidate.id === value)
  if (!runtime || runtime.status !== 'ready') return
  selectedRuntimeId.value = value
  emit('select-runtime', value)
}

function selectEffort(value: ThinkingEffort): void {
  thinkingEffort.value = value
  emit('select-effort', value)
}

function handlePointerdown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (panel.value?.contains(target) || triggerRoot.value?.contains(target)) return
  closeMenu()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  }
}

watch(
  () => props.runtimeId,
  (value) => {
    selectedRuntimeId.value = value
  },
)

watch(
  open,
  (value) => {
    if (typeof document === 'undefined') return
    if (value) {
      document.addEventListener('pointerdown', handlePointerdown)
      document.addEventListener('keydown', handleKeydown)
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      void nextTick(updatePosition)
    } else {
      document.removeEventListener('pointerdown', handlePointerdown)
      document.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  },
  { immediate: true },
)

watch(
  () => props.disabled,
  (value) => {
    if (value) closeMenu(false)
  },
)

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('pointerdown', handlePointerdown)
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <div ref="triggerRoot" class="agent-model-menu">
    <TeaButton
      appearance="ghost"
      size="small"
      type="button"
      role="combobox"
      aria-haspopup="menu"
      :aria-label="label"
      :aria-expanded="open"
      :disabled="disabled"
      class="agent-model-menu__trigger inline-flex min-h-8 min-w-0 items-center gap-1 rounded-control border border-transparent bg-transparent px-2 text-left text-sm text-dim outline-none transition-colors whitespace-nowrap hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-disabled motion-reduce:transition-none"
      @click="toggleMenu"
      @pointerdown.stop
      @keydown="handleTriggerKeydown"
    >
      <RuntimeIcon
        v-if="runtimeSelectionEnabled && selectedRuntime"
        size="small"
        :runtime-id="selectedRuntime.id"
        :label="selectedRuntimeLabel"
        class="text-subtle"
      />
      <span class="agent-model-menu__model min-w-0 flex-1 truncate">{{ selectedModelLabel }}</span>
      <template v-if="!runtimeSelectionEnabled">
        <span class="agent-model-menu__separator shrink-0 text-subtle" aria-hidden="true">·</span>
        <span class="agent-model-menu__effort min-w-0 truncate text-subtle">
          {{ t(`composer.modelMenu.effortOptions.${thinkingEffort}`) }}
        </span>
      </template>
      <span class="i-mdi-chevron-up-down size-4 shrink-0 text-subtle" aria-hidden="true" />
    </TeaButton>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        role="menu"
        :aria-label="label"
        class="agent-model-menu__panel"
        :class="runtimeSelectionEnabled ? 'agent-model-menu__panel--runtime' : ''"
        :style="position"
      >
        <template v-if="runtimeSelectionEnabled">
          <div
            class="agent-model-menu__runtime-strip"
            role="tablist"
            :aria-label="t('composer.modelMenu.agents')"
          >
            <button
              v-for="runtime in runtimes"
              :key="runtime.id"
              type="button"
              role="tab"
              :aria-selected="runtime.id === selectedRuntimeId"
              :aria-label="runtime.displayName"
              :title="runtime.displayName"
              :disabled="runtime.status !== 'ready'"
              class="agent-model-menu__runtime-tab"
              :class="
                runtime.id === selectedRuntimeId ? 'agent-model-menu__runtime-tab--active' : ''
              "
              @click="selectRuntime(runtime.id)"
            >
              <RuntimeIcon size="default" :runtime-id="runtime.id" :label="runtime.displayName" />
            </button>
          </div>
          <div class="agent-model-menu__options" role="group">
            <div
              v-for="group in selectedRuntimeModelGroups"
              :key="group.providerId"
              class="agent-model-menu__model-group"
            >
              <p v-if="group.providerLabel" class="agent-model-menu__options-title">
                {{ group.providerLabel }}
              </p>
              <TeaButton
                v-for="option in group.options"
                :key="option.value"
                appearance="ghost"
                size="small"
                type="button"
                role="menuitemradio"
                :disabled="option.disabled"
                :aria-checked="option.value === modelValue"
                class="agent-model-menu__option"
                :class="option.value === modelValue ? 'agent-model-menu__option--selected' : ''"
                @click="selectModel(option.value)"
              >
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                <span
                  v-if="option.value === modelValue"
                  class="i-mdi-check size-4 shrink-0"
                  aria-hidden="true"
                />
              </TeaButton>
            </div>
          </div>
        </template>

        <template v-else>
          <div
            class="agent-model-menu__sections"
            role="group"
            :aria-label="t('composer.modelMenu.navigation')"
          >
            <TeaButton
              appearance="ghost"
              size="small"
              type="button"
              role="menuitem"
              class="agent-model-menu__section"
              :class="activeSection === 'model' ? 'agent-model-menu__section--active' : ''"
              @click="activeSection = 'model'"
            >
              <span>{{ t('composer.modelMenu.model') }}</span>
              <span class="agent-model-menu__section-value min-w-0 truncate">
                {{ selectedModelLabel }}
              </span>
              <span class="i-mdi-chevron-right size-4 shrink-0 text-subtle" aria-hidden="true" />
            </TeaButton>
            <TeaButton
              appearance="ghost"
              size="small"
              type="button"
              role="menuitem"
              class="agent-model-menu__section"
              :class="activeSection === 'effort' ? 'agent-model-menu__section--active' : ''"
              @click="activeSection = 'effort'"
            >
              <span>{{ t('composer.modelMenu.effort') }}</span>
              <span class="agent-model-menu__section-value min-w-0 truncate">
                {{ t(`composer.modelMenu.effortOptions.${thinkingEffort}`) }}
              </span>
              <span class="i-mdi-chevron-right size-4 shrink-0 text-subtle" aria-hidden="true" />
            </TeaButton>
            <div class="agent-model-menu__advanced" aria-disabled="true">
              <span>{{ t('composer.modelMenu.advanced') }}</span>
              <span class="i-mdi-chevron-up size-4 shrink-0" aria-hidden="true" />
            </div>
          </div>

          <div class="agent-model-menu__options" role="group">
            <p class="agent-model-menu__options-title">
              {{
                activeSection === 'model'
                  ? t('composer.modelMenu.model')
                  : t('composer.modelMenu.effort')
              }}
            </p>
            <template v-if="activeSection === 'model'">
              <div
                v-for="group in modelGroups"
                :key="group.providerId"
                class="agent-model-menu__model-group"
              >
                <p v-if="group.providerLabel" class="agent-model-menu__options-title">
                  {{ group.providerLabel }}
                </p>
                <TeaButton
                  v-for="option in group.options"
                  :key="option.value"
                  appearance="ghost"
                  size="small"
                  type="button"
                  role="menuitemradio"
                  :disabled="option.disabled"
                  :aria-checked="option.value === modelValue"
                  class="agent-model-menu__option"
                  :class="option.value === modelValue ? 'agent-model-menu__option--selected' : ''"
                  @click="selectModel(option.value)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                  <span
                    v-if="option.value === modelValue"
                    class="i-mdi-check size-4 shrink-0"
                    aria-hidden="true"
                  />
                </TeaButton>
              </div>
            </template>
            <template v-else>
              <TeaButton
                v-for="option in effortOptions"
                :key="option.value"
                appearance="ghost"
                size="small"
                type="button"
                role="menuitemradio"
                :aria-checked="option.value === thinkingEffort"
                class="agent-model-menu__option"
                :class="option.value === thinkingEffort ? 'agent-model-menu__option--selected' : ''"
                @click="selectEffort(option.value)"
              >
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                <span
                  v-if="option.value === thinkingEffort"
                  class="i-mdi-check size-4 shrink-0"
                  aria-hidden="true"
                />
              </TeaButton>
              <p
                class="agent-model-menu__hint"
                :class="thinkingEffort === 'ultra' ? 'agent-model-menu__hint--visible' : ''"
              >
                {{ thinkingEffort === 'ultra' ? t('composer.modelMenu.ultraHint') : '' }}
              </p>
            </template>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.agent-model-menu {
  min-width: 0;
}

.agent-model-menu__trigger {
  width: 100%;
  max-width: 15rem;
  white-space: nowrap;
  line-height: 1.25;
}

.agent-model-menu__model,
.agent-model-menu__effort {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-model-menu__model {
  font-weight: 500;
}

.agent-model-menu__panel {
  display: grid;
  position: fixed;
  grid-template-columns: minmax(10rem, 12rem) minmax(15rem, 1fr);
  grid-template-rows: minmax(0, 1fr);
  width: min(31rem, calc(100vw - 1rem));
  max-height: min(22rem, calc(100vh - 1rem));
  overflow: hidden;
  border: 1px solid var(--tea-line-soft);
  border-radius: var(--tea-radius-overlay);
  background: var(--tea-raised);
  color: var(--tea-fg);
  z-index: 50;
}

.agent-model-menu__panel--runtime {
  display: block;
  width: min(26rem, calc(100vw - 1rem));
}

.agent-model-menu__runtime-strip {
  display: flex;
  min-height: 3.25rem;
  align-items: stretch;
  gap: 0.25rem;
  overflow-x: auto;
  background: var(--tea-panel);
  padding: 0 0.5rem;
}

.agent-model-menu__runtime-tab {
  display: inline-flex;
  position: relative;
  min-width: 3.25rem;
  min-height: 0;
  align-items: center;
  justify-content: center;
  margin: 0 0.125rem;
  border: 0;
  border-radius: 0;
  color: var(--tea-subtle);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.agent-model-menu__runtime-tab::after {
  position: absolute;
  right: -1px;
  bottom: 0;
  left: -1px;
  height: 2px;
  background: transparent;
  content: '';
  pointer-events: none;
}

.agent-model-menu__runtime-tab::before {
  position: absolute;
  inset: 0.375rem 0;
  border-radius: 0;
  background: transparent;
  content: '';
  pointer-events: none;
  transition: background-color 150ms ease;
}

.agent-model-menu__runtime-tab:not(.agent-model-menu__runtime-tab--active):hover,
.agent-model-menu__runtime-tab:not(.agent-model-menu__runtime-tab--active):focus-visible {
  background: transparent;
  color: var(--tea-fg);
  outline: none;
}

.agent-model-menu__runtime-tab:not(.agent-model-menu__runtime-tab--active):hover::before,
.agent-model-menu__runtime-tab:not(.agent-model-menu__runtime-tab--active):focus-visible::before {
  background: var(--tea-hover);
}

.agent-model-menu__runtime-tab--active {
  background: var(--tea-canvas);
  color: var(--tea-fg);
  outline: none;
}

.agent-model-menu__runtime-tab--active::after {
  top: 0;
  bottom: auto;
  background: var(--tea-fg);
}

.agent-model-menu__runtime-tab:disabled {
  cursor: not-allowed;
  color: var(--tea-disabled);
  opacity: 0.6;
}

.agent-model-menu__sections {
  padding: 0.25rem;
  background: var(--tea-panel);
}

.agent-model-menu__section {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: 100%;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--tea-radius-inline);
  padding: 0 0.5rem;
  color: var(--tea-dim);
  font-size: 0.8125rem;
  text-align: left;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.agent-model-menu__section:hover,
.agent-model-menu__section:focus-visible,
.agent-model-menu__section--active {
  background: var(--tea-hover);
  color: var(--tea-fg);
  outline: none;
}

.agent-model-menu__section-value {
  color: var(--tea-subtle);
  text-align: right;
}

.agent-model-menu__advanced {
  display: flex;
  min-height: 2.25rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.625rem;
  color: var(--tea-disabled);
  font-size: 0.8125rem;
}

.agent-model-menu__options {
  min-width: 0;
  min-height: 0;
  max-height: min(18.5rem, calc(100vh - 5rem));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.5rem;
}

.agent-model-menu__model-group + .agent-model-menu__model-group {
  margin-top: 0.5rem;
}

.agent-model-menu__options-title {
  margin: 0 0 0.25rem;
  padding: 0.25rem 0.625rem;
  color: var(--tea-subtle);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-transform: uppercase;
}

.agent-model-menu__option {
  display: flex;
  width: 100%;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--tea-radius-inline);
  padding: 0 0.625rem;
  color: var(--tea-dim);
  font-size: 0.8125rem;
  line-height: 1.25;
  text-align: left;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.agent-model-menu__option:hover,
.agent-model-menu__option:focus-visible,
.agent-model-menu__option--selected {
  background: var(--tea-hover);
  color: var(--tea-fg);
  outline: none;
}

.agent-model-menu__option:disabled {
  cursor: not-allowed;
  color: var(--tea-disabled);
  opacity: 0.6;
}

.agent-model-menu__hint {
  min-height: 1.125rem;
  margin: 0.25rem 0 0;
  padding: 0 0.625rem;
  color: transparent;
  font-size: 0.6875rem;
  line-height: 1.25;
}

.agent-model-menu__hint--visible {
  color: var(--tea-subtle);
}

@media (max-width: 36rem) {
  .agent-model-menu__panel {
    grid-template-columns: minmax(8.5rem, 10rem) minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-model-menu__runtime-tab,
  .agent-model-menu__runtime-tab::before,
  .agent-model-menu__section,
  .agent-model-menu__option {
    transition: none;
  }
}
</style>
