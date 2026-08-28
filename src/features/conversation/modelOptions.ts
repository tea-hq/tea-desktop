import type { ModelOption, RuntimeDescriptor } from './contracts'

const DEFAULT_OPTION: ModelOption = {
  value: 'default',
  labelKey: 'composer.model.configured',
}

export function runtimeModelOptions(runtime: RuntimeDescriptor | null): ModelOption[] {
  if (runtime?.id !== 'external.claude') return [{ ...DEFAULT_OPTION }]
  return [
    { value: 'default', labelKey: 'composer.model.default' },
    { value: 'sonnet', labelKey: 'composer.model.sonnet' },
    { value: 'opus', labelKey: 'composer.model.opus' },
    { value: 'haiku', labelKey: 'composer.model.haiku' },
  ]
}
