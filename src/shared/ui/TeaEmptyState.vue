<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; icon?: string }>(), {
  description: '',
  icon: '',
})
</script>

<template>
  <section class="tea-empty-state" role="status">
    <span v-if="icon" :class="['tea-empty-state__icon', icon]" aria-hidden="true" />
    <h2 class="tea-empty-state__title">{{ title }}</h2>
    <p v-if="description" class="tea-empty-state__description">{{ description }}</p>
    <div v-if="$slots.actions" class="tea-empty-state__actions"><slot name="actions" /></div>
  </section>
</template>

<style scoped>
.tea-empty-state {
  display: flex;
  min-height: 12rem;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
}
.tea-empty-state__icon {
  width: 2rem;
  height: 2rem;
  margin-bottom: 0.75rem;
  color: var(--p-text-muted-color);
}
.tea-empty-state__title {
  margin: 0;
  color: var(--p-text-color);
  font-size: 1rem;
  font-weight: 600;
}
.tea-empty-state__description {
  max-width: 28rem;
  margin: 0.375rem 0 0;
  line-height: 1.5;
}
.tea-empty-state__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
