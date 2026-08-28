import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { EndpointBootstrap } from '@/features/auth/contracts'
import { projectManagedConfiguration } from './contracts'

export const useManagedConfigStore = defineStore('managed-config', () => {
  const bootstrap = ref<EndpointBootstrap | null>(null)
  const configuration = computed(() => projectManagedConfiguration(bootstrap.value))

  function apply(value: EndpointBootstrap | null): void {
    bootstrap.value =
      value && value.schemaVersion === 1
        ? {
            schemaVersion: value.schemaVersion,
            revision: value.revision,
            generatedAt: value.generatedAt,
            tenant: { ...value.tenant },
            user: { ...value.user },
            im: value.im ? { ...value.im } : null,
            modelProviders: value.modelProviders.map((provider) => ({
              ...provider,
              models: [...provider.models],
            })),
          }
        : null
  }

  function clear(): void {
    bootstrap.value = null
  }

  return { bootstrap, configuration, apply, clear }
})
