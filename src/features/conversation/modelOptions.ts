import type { ModelOption, RuntimeDescriptor } from './contracts'

const DEFAULT_OPTION: ModelOption = {
  value: 'default',
  labelKey: 'composer.model.configured',
}

export function teaModelOptions(
  runtime: RuntimeDescriptor | null,
  selectedModel: string,
  labelOverrides: ModelOption[] = [],
): ModelOption[] {
  if (runtime?.id !== 'builtin.tea') return [{ ...DEFAULT_OPTION }]

  const labels = new Map(labelOverrides.map(option => [option.value, option]))
  const options = (runtime.models ?? []).map<ModelOption>(model => {
    const override = labels.get(model.value)
    return {
      value: model.value,
      label: override?.label ?? `${model.providerId} / ${model.displayName}`,
      labelKey: override?.labelKey,
      source: model.source,
    }
  })
  if (selectedModel !== 'default' && !options.some(option => option.value === selectedModel)) {
    options.push({
      value: selectedModel,
      label: selectedModel,
      unavailable: true,
    })
  }
  return [{ ...DEFAULT_OPTION }, ...options]
}
