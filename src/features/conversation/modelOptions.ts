import type { ModelOption, RuntimeDescriptor } from './contracts'

const DEFAULT_OPTION: ModelOption = {
  value: 'default',
  labelKey: 'composer.model.configured',
}

export function runtimeModelOptions(runtime: RuntimeDescriptor | null): ModelOption[] {
  if (!runtime?.models?.length) return [{ ...DEFAULT_OPTION }]
  return runtime.models.map((model) => ({
    value: model.value,
    label: model.displayName,
    source: model.source,
  }))
}
