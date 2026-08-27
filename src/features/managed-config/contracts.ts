import type { EndpointBootstrap } from '@/features/auth/contracts'

export interface ManagedConfiguration {
  revision: number
  im: EndpointBootstrap['im']
  modelProviders: EndpointBootstrap['modelProviders']
}

export function projectManagedConfiguration(bootstrap: EndpointBootstrap | null): ManagedConfiguration | null {
  if (!bootstrap || bootstrap.schemaVersion !== 1) return null
  return {
    revision: bootstrap.revision,
    im: bootstrap.im,
    modelProviders: bootstrap.modelProviders.filter(provider => provider.enabled),
  }
}
