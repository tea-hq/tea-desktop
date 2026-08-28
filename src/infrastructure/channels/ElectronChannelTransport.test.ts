import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn().mockResolvedValue(() => undefined),
}))

vi.mock('../electronBridge', () => ({ invoke: mocks.invoke, listen: mocks.listen }))

import { ElectronChannelTransport } from './ElectronChannelTransport'

describe('ElectronChannelTransport', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.listen.mockClear()
  })

  it('connects through Host status without passing credentials from the WebView', async () => {
    mocks.invoke.mockResolvedValueOnce({
      phase: 'connected',
      account: 'account',
      accountRef: 'safe-ref',
      retryable: false,
    })
    const transport = new ElectronChannelTransport()

    await transport.connect()

    expect(mocks.invoke).toHaveBeenCalledWith('get_channel_status')
    expect(JSON.stringify(mocks.invoke.mock.calls)).not.toMatch(/token|appKey|apiKey/i)
    expect(transport.status().phase).toBe('connected')
    await transport.dispose()
  })

  it('loads self profile through the Electron host without exposing credentials', async () => {
    mocks.invoke.mockResolvedValueOnce({
      accountId: 'account',
      name: 'Tea User',
      email: 'user@example.test',
    })
    const transport = new ElectronChannelTransport()

    expect(transport.capabilities()).toContainEqual({
      id: 'profile.self',
      available: true,
    })
    await expect(transport.getSelfProfile()).resolves.toEqual({
      accountId: 'account',
      name: 'Tea User',
      email: 'user@example.test',
    })
    expect(mocks.invoke).toHaveBeenCalledWith('get_channel_self_profile', {})
    expect(JSON.stringify(mocks.invoke.mock.calls)).not.toMatch(/token|appKey|apiKey/i)
    await transport.dispose()
  })
})
