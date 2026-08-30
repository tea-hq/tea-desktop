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

export function mergeModelOptions(...groups: readonly ModelOption[][]): ModelOption[] {
  const seen = new Set<string>()
  const merged: ModelOption[] = []
  for (const group of groups) {
    for (const option of group) {
      if (seen.has(option.value)) continue
      seen.add(option.value)
      merged.push({ ...option })
    }
  }
  return merged.length > 0 ? merged : [{ ...DEFAULT_OPTION }]
}
