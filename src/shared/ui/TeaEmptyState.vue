<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; icon?: string }>(), {
  description: '',
  icon: '',
})
</script>

<template>
  <section
    class="flex min-h-48 flex-col items-center justify-center px-8 py-8 text-center text-dim"
    role="status"
  >
    <span v-if="icon" :class="['mb-3 size-8 text-subtle', icon]" aria-hidden="true" />
    <h2 class="m-0 text-base font-semibold text-fg">{{ title }}</h2>
    <p v-if="description" class="mt-1.5 max-w-md leading-5">{{ description }}</p>
    <div v-if="$slots.actions" class="mt-4 flex flex-wrap justify-center gap-2">
      <slot name="actions" />
    </div>
  </section>
</template>
