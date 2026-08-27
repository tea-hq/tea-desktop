import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../electronBridge', () => ({ invoke: mocks.invoke }))

import { ElectronManagedImCredentialClient } from './electronManagedImCredentials'

describe('ElectronManagedImCredentialClient', () => {
  beforeEach(() => mocks.invoke.mockReset())

  it('loads active credentials through one argument-free command', async () => {
    mocks.invoke.mockResolvedValue({ appKey: 'app-key', account: 'account-a', token: 'secret-token' })
    const client = new ElectronManagedImCredentialClient()

    await expect(client.load()).resolves.toEqual({
      appKey: 'app-key', account: 'account-a', token: 'secret-token',
    })
    expect(mocks.invoke).toHaveBeenCalledWith('get_managed_im_credentials')
    expect(JSON.stringify(mocks.invoke.mock.calls)).not.toContain('secret-token')
  })
})
