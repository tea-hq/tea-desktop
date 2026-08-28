import { describe, expect, expectTypeOf, it } from 'vitest'

import * as acpV1 from '@agentclientprotocol/sdk'
import * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'

describe('official ACP SDK entrypoints', () => {
  it('exposes distinct stable V1 and experimental V2 clients', () => {
    expect(acpV1.PROTOCOL_VERSION).toBe(1)
    expect(acpV2.PROTOCOL_VERSION).toBe(2)
    expectTypeOf(acpV1.client).toBeFunction()
    expectTypeOf(acpV1.ndJsonStream).toBeFunction()
    expectTypeOf(acpV2.client).toBeFunction()
    expectTypeOf(acpV2.ndJsonStream).toBeFunction()
  })

  it('type-checks initialization and client callback method names', () => {
    const v1Initialize: acpV1.InitializeRequest = {
      protocolVersion: acpV1.PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: 'tea-desktop', version: '0.1.0' },
    }
    const v2Initialize: acpV2.InitializeRequest = {
      protocolVersion: acpV2.PROTOCOL_VERSION,
      capabilities: {},
      info: { name: 'tea-desktop', version: '0.1.0' },
    }

    expect(v1Initialize.protocolVersion).toBe(1)
    expect(v2Initialize.protocolVersion).toBe(2)
    expect(acpV1.methods.client.session.requestPermission).toBe('session/request_permission')
    expect(acpV1.methods.client.session.update).toBe('session/update')
    expect(acpV2.methods.agent.initialize).toBe('initialize')
  })
})
