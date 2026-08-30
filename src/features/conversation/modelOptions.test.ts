import { describe, expect, it } from 'vitest'

import type { RuntimeDescriptor } from './contracts'
import { mergeModelOptions, runtimeModelOptions } from './modelOptions'

const claude: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt'],
  status: 'ready',
}

describe('runtimeModelOptions', () => {
  it('does not infer model choices from the runtime id', () => {
    expect(runtimeModelOptions(claude)).toEqual([
      { value: 'default', labelKey: 'composer.model.configured' },
    ])
  })

  it('uses the configured default option for other external runtimes', () => {
    expect(
      runtimeModelOptions({
        ...claude,
        id: 'external.codex',
        displayName: 'Codex',
      }),
    ).toEqual([{ value: 'default', labelKey: 'composer.model.configured' }])
  })

  it('projects only models advertised by the runtime descriptor', () => {
    expect(
      runtimeModelOptions({
        ...claude,
        models: [
          {
            value: 'claude-sonnet-5',
            providerId: 'anthropic',
            displayName: 'Sonnet 5',
            source: 'runtime',
          },
        ],
      }),
    ).toEqual([{ value: 'claude-sonnet-5', label: 'Sonnet 5', source: 'runtime' }])
  })

  it('merges model catalogs without duplicating values', () => {
    expect(
      mergeModelOptions(
        [
          { value: 'default', labelKey: 'composer.model.configured' },
          { value: 'model-a', label: 'Runtime A' },
        ],
        [
          { value: 'model-a', label: 'Provider A' },
          { value: 'model-b', label: 'Provider B' },
        ],
      ),
    ).toEqual([
      { value: 'default', labelKey: 'composer.model.configured' },
      { value: 'model-a', label: 'Runtime A' },
      { value: 'model-b', label: 'Provider B' },
    ])
  })
})
