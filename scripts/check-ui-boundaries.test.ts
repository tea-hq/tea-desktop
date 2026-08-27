import { describe, expect, it } from 'vitest'

import { inspectUiSource } from './check-ui-boundaries.mjs'

describe('UI boundary checker', () => {
  it('rejects direct PrimeVue and theme imports outside shared UI', () => {
    const violations = inspectUiSource('src/features/example/Example.vue', `
      <script setup lang="ts">
      import Button from 'primevue/button'
      import Aura from '@primeuix/themes/aura'
      </script>
      <template><div /></template>
    `)

    expect(violations.map(value => value.kind)).toEqual(['library-import', 'library-import'])
  })

  it('rejects native controls while allowing a file input', () => {
    const violations = inspectUiSource('src/features/example/Example.vue', `
      <template>
        <button>Save</button>
        <select><option>One</option></select>
        <input type="text">
        <input type="file">
        <textarea />
      </template>
    `)

    expect(violations.filter(value => value.kind === 'native-control').map(value => value.value))
      .toEqual(['button', 'select', 'input', 'textarea'])
  })

  it('rejects visual Tailwind tokens from static and bound classes', () => {
    const violations = inspectUiSource('src/features/example/Example.vue', `
      <template>
        <div class="flex h-8 bg-white rounded-lg text-sm" :class="active ? 'shadow-md font-medium' : 'overflow-hidden'" />
      </template>
    `)

    expect(violations.filter(value => value.kind === 'visual-class').map(value => value.value))
      .toEqual(['bg-white', 'rounded-lg', 'text-sm', 'shadow-md', 'font-medium'])
  })

  it('permits PrimeVue imports inside shared UI', () => {
    expect(inspectUiSource('src/shared/ui/TeaButton.vue', `
      <script setup lang="ts">import Button from 'primevue/button'</script>
      <template><Button /></template>
    `)).toEqual([])
  })
})
