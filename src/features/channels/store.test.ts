import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockChannelTransport } from '@/infrastructure/channels/MockChannelTransport'
import { useChannelsStore } from './store'

async function connectedStore() {
  const transport = new MockChannelTransport()
  const store = useChannelsStore()
  store.configure(transport)
  await store.connect()
  return { store, transport }
}

describe('useChannelsStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads the catalog without selecting a Channel', async () => {
    const { store } = await connectedStore()
    expect(store.channels.length).toBeGreaterThan(0)
    expect(store.activeChannelRef).toBeNull()
    expect(store.status.accountRef).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps an initial empty catalog loading until conversation sync finishes', async () => {
    const transport = new MockChannelTransport()
    const listChannels = vi.spyOn(transport, 'listChannels')
    const synchronizedPage = await transport
      .connect()
      .then(() => transport.listChannels({ offset: 0, limit: 100 }))
    await transport.disconnect()
    let synchronized = false
    listChannels.mockImplementation(async () =>
      synchronized
        ? structuredClone(synchronizedPage)
        : { items: [], nextOffset: 0, hasMore: false },
    )
    const store = useChannelsStore()
    store.configure(transport)

    await store.connect()

    expect(store.channels).toEqual([])
    expect(store.loadingChannels).toBe(true)

    synchronized = true
    transport.emitForTest({ type: 'sync.finished' })
    await vi.waitFor(() => expect(store.channels.length).toBeGreaterThan(0))
    expect(store.loadingChannels).toBe(false)
  })

  it('settles on a real empty catalog after conversation sync finishes', async () => {
    const transport = new MockChannelTransport()
    vi.spyOn(transport, 'listChannels').mockResolvedValue({
      items: [],
      nextOffset: 0,
      hasMore: false,
    })
    const store = useChannelsStore()
    store.configure(transport)
    await store.connect()
    expect(store.loadingChannels).toBe(true)

    transport.emitForTest({ type: 'sync.finished' })

    await vi.waitFor(() => expect(store.loadingChannels).toBe(false))
    expect(store.channels).toEqual([])

    await store.connect()
    expect(store.loadingChannels).toBe(false)
  })

  it('loads normalized messages and marks an explicit selection read', async () => {
    const { store, transport } = await connectedStore()
    const markRead = vi.spyOn(transport, 'markRead')
    await store.selectChannel('product-collab')
    expect(store.activeMessages.length).toBeGreaterThan(0)
    expect(markRead).toHaveBeenCalledWith('product-collab')
  })

  it('merges out-of-order realtime events into the same projection', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const latest = JSON.parse(JSON.stringify(store.activeMessages.at(-1)!))
    transport.emitForTest({ type: 'message.revoked', refs: [latest.ref] })
    transport.emitForTest({
      type: 'message.upserted',
      messages: [{ ...latest, text: 'updated', state: 'active' }],
    })
    expect(store.activeMessages.at(-1)).toMatchObject({ text: 'updated', state: 'active' })
  })

  it('sends through the transport and keeps the provider message identity', async () => {
    const { store } = await connectedStore()
    await store.selectChannel('product-collab')
    const result = await store.sendText('Hello')
    expect(result?.ref.messageServerId).toBeTruthy()
    expect(store.activeMessages.at(-1)?.text).toBe('Hello')
  })

  it('clears account-scoped projection on kicked-offline and disposes once', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    transport.emitForTest({
      type: 'status.changed',
      status: { phase: 'kickedOffline', retryable: false },
    })
    expect(store.channels).toEqual([])
    expect(store.activeChannelRef).toBeNull()
    await store.dispose()
    await store.dispose()
  })

  it('does not repopulate a disposed tenant from a late catalog response', async () => {
    const transport = new MockChannelTransport()
    const original = transport.listChannels.bind(transport)
    await transport.connect()
    const page = await original({ offset: 0, limit: 100 })
    await transport.disconnect()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const list = vi.spyOn(transport, 'listChannels').mockImplementation(async () => {
      await gate
      return structuredClone(page)
    })
    const store = useChannelsStore()
    store.configure(transport)
    const connecting = store.connect()
    await vi.waitFor(() => expect(list).toHaveBeenCalled())

    const disposing = store.dispose()
    release()
    await Promise.all([connecting, disposing])

    expect(store.channels).toEqual([])
    expect(store.status.phase).toBe('disconnected')
    expect(store.loadingChannels).toBe(false)
  })
})
