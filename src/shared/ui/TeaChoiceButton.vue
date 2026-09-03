<script setup lang="ts">
withDefaults(
  defineProps<{
    selected: boolean
    controlRole: 'radio' | 'checkbox'
    appearance?: 'row' | 'segment' | 'compact'
    disabled?: boolean
  }>(),
  { appearance: 'row', disabled: false },
)

const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    :role="controlRole"
    :aria-checked="selected"
    :disabled="disabled"
    :class="[
      'border text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
      appearance === 'row' &&
        'flex min-h-11 w-full items-start gap-2.5 rounded-control px-3 py-2.5 text-left',
      appearance === 'segment' &&
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-control px-3 font-semibold',
      appearance === 'compact' &&
        'flex min-h-10 items-center gap-2 rounded-control px-3 text-left font-medium',
      selected && appearance === 'segment'
        ? 'border-fg bg-fg text-on-accent'
        : selected
          ? 'border-fg bg-canvas text-fg'
          : 'border-line bg-canvas text-dim hover:border-line-strong hover:bg-hover hover:text-fg',
    ]"
    @click="emit('select')"
  >
    <slot :selected="selected" />
  </button>
</template>
