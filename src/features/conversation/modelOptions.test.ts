import { describe, expect, it } from 'vitest'

import type { RuntimeDescriptor } from './contracts'
import { teaModelOptions } from './modelOptions'

const tea: RuntimeDescriptor = {
  id: 'builtin.tea',
  kind: 'builtInTea',
  displayName: 'Tea Agent',
  capabilities: ['prompt'],
  status: 'ready',
  models: [
    {
      value: 'local.openai:gpt-local',
      providerId: 'local.openai',
      displayName: 'GPT Local',
      source: 'local',
    },
    {
      value: 'center.workshop:gpt-center',
      providerId: 'center.workshop',
      displayName: 'GPT Center',
      source: 'center',
    },
  ],
}

describe('teaModelOptions', () => {
  it('keeps local and Center models alongside the configured selection', () => {
    expect(teaModelOptions(tea, 'default', [
      { value: 'center.workshop:gpt-center', label: 'Workshop / GPT Center' },
    ])).toEqual([
      { value: 'default', labelKey: 'composer.model.configured' },
      {
        value: 'local.openai:gpt-local',
        label: 'local.openai / GPT Local',
        labelKey: undefined,
        source: 'local',
      },
      {
        value: 'center.workshop:gpt-center',
        label: 'Workshop / GPT Center',
        labelKey: undefined,
        source: 'center',
      },
    ])
  })

  it('retains an explicitly selected model after its provider disappears', () => {
    const options = teaModelOptions(
      { ...tea, models: tea.models?.slice(0, 1) },
      'center.workshop:gpt-center',
    )

    expect(options.at(-1)).toEqual({
      value: 'center.workshop:gpt-center',
      label: 'center.workshop:gpt-center',
      unavailable: true,
    })
  })
})
