import { describe, expect, it } from 'vitest'

import { AcpAgentCatalog, officialAcpAgentDefinitions } from './agentCatalog'

describe('AcpAgentCatalog', () => {
  it('defines pinned official Agents behind stable product runtime ids', () => {
    expect(officialAcpAgentDefinitions()).toMatchObject([
      {
        id: 'claude.acp',
        runtimeId: 'external.claude',
        artifact: { packageName: '@agentclientprotocol/claude-agent-acp', version: '0.70.0' },
        preferredWireVersions: [2, 1],
      },
      {
        id: 'codex.acp',
        runtimeId: 'external.codex',
        artifact: { packageName: '@agentclientprotocol/codex-acp', version: '1.7.0' },
        preferredWireVersions: [2, 1],
      },
    ])
  })

  it('rejects duplicate definition ids and unknown lookups', () => {
    const definition = officialAcpAgentDefinitions()[0]
    expect(() => new AcpAgentCatalog([definition, definition])).toThrow('duplicate ACP Agent')
    expect(() => new AcpAgentCatalog().require('missing')).toThrow('ACP Agent is not defined')
  })
})
