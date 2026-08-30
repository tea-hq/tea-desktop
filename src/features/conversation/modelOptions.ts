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
  const concrete = merged.filter((option) => !isConfiguredOption(option))
  return concrete.length > 0 ? concrete : [{ ...DEFAULT_OPTION }]
}

function isConfiguredOption(option: ModelOption): boolean {
  return option.value === DEFAULT_OPTION.value && option.labelKey === DEFAULT_OPTION.labelKey
}

export function resolveModelSelection(
  options: readonly ModelOption[],
  preferredModel: string | null | undefined,
): string {
  const preferred = options.find((option) => option.value === preferredModel && !option.unavailable)
  if (preferred) return preferred.value
  return options.find((option) => !option.unavailable)?.value ?? DEFAULT_OPTION.value
}
