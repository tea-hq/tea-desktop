import { describe, expect, it } from 'vitest'

import type { RuntimeDescriptor } from './contracts'
import { runtimeModelOptions } from './modelOptions'

const claude: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt'],
  status: 'ready',
}

describe('runtimeModelOptions', () => {
  it('exposes the supported Claude Code model choices', () => {
    expect(runtimeModelOptions(claude)).toEqual([
      { value: 'default', labelKey: 'composer.model.default' },
      { value: 'sonnet', labelKey: 'composer.model.sonnet' },
      { value: 'opus', labelKey: 'composer.model.opus' },
      { value: 'haiku', labelKey: 'composer.model.haiku' },
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
})
