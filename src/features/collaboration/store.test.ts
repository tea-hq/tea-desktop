import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChannelTransportError,
  type ChannelCapability,
  type SendMessageRequest,
  type SendMessageResult,
} from '@/features/channels/contracts'
import type { RuntimeDescriptor, SendMessageOptions } from '@/features/conversation/contracts'
import { MockChannelTransport } from '@/infrastructure/channels/MockChannelTransport'
import { FakeConversationClient } from '@/infrastructure/conversation/electronConversationClient'
import { useCollaborationStore } from './store'

const runtime: RuntimeDescriptor = {
  id: 'external.codex',
  kind: 'externalCli',
  displayName: 'Codex',
  capabilities: ['prompt', 'events', 'snapshot', 'hostTools'],
  status: 'ready',
}

class RecordingConversationClient extends FakeConversationClient {
  sends: Array<{ conversationId: string; text: string; options: SendMessageOptions }> = []

  override async sendMessage(
    conversationId: string,
    text: string,
    options: SendMessageOptions,
  ): Promise<void> {
    this.sends.push({ conversationId, text, options: structuredClone(options) })
    await super.sendMessage(conversationId, text, options)
  }
}

class NoSendTransport extends MockChannelTransport {
  override capabilities(): ChannelCapability[] {
    return super
      .capabilities()
      .map((capability) =>
        capability.id === 'message.send.text'
          ? { ...capability, available: false, reason: 'unsupported' }
          : capability,
      )
  }
}

class FailBeforeSendTransport extends MockChannelTransport {
  attempts = 0

  override async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    this.attempts += 1
    if (this.attempts === 1) throw new ChannelTransportError('transport', true)
    return super.sendMessage(request)
  }
}

class LoseAcknowledgementTransport extends MockChannelTransport {
  attempts = 0

  override async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    this.attempts += 1
    const result = await super.sendMessage(request)
    if (this.attempts === 1) throw new ChannelTransportError('transport', true)
    return result
  }
}

class StructuredErrorConversationClient extends RecordingConversationClient {
  override async createConversation(): Promise<never> {
    throw { code: 'restoreFailed', message: 'start codex thread: protocol failed', retryable: true }
  }
}

async function setup(transport: MockChannelTransport = new MockChannelTransport()) {
  await transport.connect()
  const client = new RecordingConversationClient()
  client.setRuntimes([runtime])
  const store = useCollaborationStore()
  store.configure(client, transport)
  await store.loadRuntimes()
  await store.bindChannel('product-collab')
  return { store, client, transport }
}

describe('useCollaborationStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stages and deduplicates sources without starting an Agent run', async () => {
    const { store, client, transport } = await setup()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 2,
    })
    store.stageMessage(page.items[0]!)
    store.stageMessage(page.items[0]!)

    expect(store.stagedSources).toHaveLength(1)
    expect(store.chooserOpen).toBe(true)
    expect(client.sends).toEqual([])
  })

  it('creates the selected runtime conversation only when the first prompt is sent', async () => {
    const { store, client } = await setup()
    const create = vi.spyOn(client, 'createConversation')
    store.selectRuntime('external.codex')

    await store.sendMessage('Start only now')

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[1].hostTools).toMatchObject([
      { name: 'load_channel_messages', version: '1.0.0' },
    ])
    expect(client.sends).toHaveLength(1)
    expect(client.sends[0]?.text).toBe('Start only now')
    expect(store.conversationId).toBeTruthy()
  })

  it('prepares a runtime draft before staging a quick-menu message', async () => {
    const { store, transport } = await setup()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 1,
    })

    const created = await store.createConversationForMessage('external.codex', page.items[0]!)

    expect(created).toBe(true)
    expect(store.activeConversation).toBeNull()
    expect(store.selectedRuntimeId).toBe('external.codex')
    expect(store.stagedSources).toHaveLength(1)
    expect(store.chooserOpen).toBe(false)
  })

  it('creates one bound conversation and supports sourced and source-free turns', async () => {
    const { store, client, transport } = await setup()
    const preparedId = await store.createConversation('external.codex')
    expect({ preparedId, active: store.conversationId, error: store.error }).toMatchObject({
      preparedId: null,
      active: null,
      error: null,
    })
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 1,
    })
    store.stageMessage(page.items[0]!)
    await store.sendMessage('Summarize the decision')
    const conversationId = store.conversationId
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    await store.sendMessage('What remains unresolved?')

    expect(conversationId).toBeTruthy()
    expect(store.activeConversation?.channelBinding).toEqual(store.activeBinding)
    expect(client.sends[0]?.options.sources).toHaveLength(1)
    expect(client.sends[1]?.options.sources).toEqual([])
    expect(store.turns).toHaveLength(2)
  })

  it('preserves structured IPC error messages', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const client = new StructuredErrorConversationClient()
    client.setRuntimes([runtime])
    const store = useCollaborationStore()
    store.configure(client, transport)
    await store.loadRuntimes()
    await store.bindChannel('product-collab')
    store.selectRuntime('external.codex')

    await store.sendMessage('Fail on send')

    expect(store.error).toEqual({ kind: 'runtime', message: 'start codex thread: protocol failed' })
    expect(client.sends).toEqual([])
  })

  it('renames and archives bound conversations through the collaboration projection', async () => {
    const { store } = await setup()
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare release review')
    const conversationId = store.conversationId

    expect(await store.renameConversation(conversationId!, 'Release review')).toBe(true)
    expect(store.activeConversation?.title).toBe('Release review')

    expect(await store.archiveConversation(conversationId!)).toBe(true)
    expect(store.conversations).toEqual([])
    expect(store.conversationId).toBeNull()
    expect(store.activeConversation).toBeNull()
  })

  it('versions a Draft and repeated confirmation sends only once', async () => {
    const { store, transport } = await setup()
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )
    const updated = await store.updateDraft(draft!.draftId, 'Reviewed response')
    const send = vi.spyOn(transport, 'sendMessage')

    await store.deliverDraft(updated!.draftId)
    await store.deliverDraft(updated!.draftId)

    expect(send).toHaveBeenCalledTimes(1)
    expect(store.collaboration.deliveries[0]).toMatchObject({ status: 'sent' })
    expect(store.collaboration.deliveries[0]?.sentMessageRef?.messageServerId).toBeTruthy()
  })

  it('retries a failed Draft delivery with the same delivery identity', async () => {
    const transport = new FailBeforeSendTransport()
    const { store } = await setup(transport)
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )

    await store.deliverDraft(draft!.draftId)
    const failed = store.collaboration.deliveries[0]!
    expect(failed).toMatchObject({ status: 'failed', failureCode: 'transport' })

    await store.deliverDraft(draft!.draftId)

    expect(transport.attempts).toBe(2)
    expect(store.collaboration.deliveries[0]).toMatchObject({
      deliveryId: failed.deliveryId,
      idempotencyKey: failed.idempotencyKey,
      status: 'sent',
    })
    expect(store.error).toBeNull()
  })

  it('reconciles an uncertain delivery from Channel history without resending', async () => {
    const transport = new LoseAcknowledgementTransport()
    const { store } = await setup(transport)
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )

    await store.deliverDraft(draft!.draftId)
    expect(store.collaboration.deliveries[0]).toMatchObject({ status: 'failed' })

    await store.deliverDraft(draft!.draftId)

    expect(transport.attempts).toBe(1)
    expect(store.collaboration.deliveries[0]).toMatchObject({ status: 'sent' })
  })

  it('fails closed when delivery capability is unavailable', async () => {
    const { store } = await setup(new NoSendTransport())
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )

    await store.deliverDraft(draft!.draftId)

    expect(store.error).toMatchObject({ kind: 'runtime', message: 'channelCapabilityUnavailable' })
    expect(store.collaboration.deliveries).toEqual([])
  })

  it('clears the account-bound projection after disconnect', async () => {
    const { store, transport } = await setup()
    await store.createConversation('external.codex')
    await transport.disconnect()
    await store.bindChannel('product-collab')

    expect(store.activeBinding).toBeNull()
    expect(store.conversationId).toBeNull()
    expect(store.conversations).toEqual([])
  })

  it('clears every tenant projection on dispose', async () => {
    const { store } = await setup()
    await store.createConversation('external.codex')
    store.openChooser()

    store.dispose()

    expect(store.runtimes).toEqual([])
    expect(store.conversations).toEqual([])
    expect(store.activeBinding).toBeNull()
    expect(store.conversationId).toBeNull()
    expect(store.turns).toEqual([])
    expect(store.collaboration).toEqual({ turnContexts: [], drafts: [], deliveries: [] })
    expect(store.stagedSources).toEqual([])
    expect(store.chooserOpen).toBe(false)
    expect(store.error).toBeNull()
  })
})
