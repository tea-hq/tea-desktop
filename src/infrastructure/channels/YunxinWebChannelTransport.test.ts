import { describe, expect, it, vi } from 'vitest'
import type { ChannelEvent } from '@/features/channels/contracts'
import { verifyTransportContract } from './contractTests'
import {
  resolveYunxinSdkModule,
  YunxinWebChannelTransport,
  type YunxinSdkFactory,
} from './YunxinWebChannelTransport'
import type {
  ManagedImCredentialClient,
  ManagedImCredentials,
} from './electronManagedImCredentials'

type Listener = (...args: never[]) => void

class FakeService {
  listeners = new Map<string, Set<Listener>>()

  on(name: string, listener: Listener): void {
    const values = this.listeners.get(name) ?? new Set()
    values.add(listener)
    this.listeners.set(name, values)
  }

  off(name: string, listener: Listener): void {
    this.listeners.get(name)?.delete(listener)
  }

  emit(name: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(name) ?? []) listener(...(args as never[]))
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, values) => sum + values.size, 0)
  }
}

function createFakeSdk() {
  const login = Object.assign(new FakeService(), {
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
  })
  const conversation = Object.assign(new FakeService(), {
    getConversationList: vi.fn(async (offset: number, limit: number) => ({
      offset: 0,
      finished: true,
      conversationList:
        offset > 0
          ? []
          : [
              {
                conversationId: 'c1',
                type: 1,
                name: 'Alice',
                stickTop: false,
                localExtension: '',
                serverExtension: '',
                unreadCount: 1,
                sortOrder: 3,
                createTime: 1,
                updateTime: 2,
                lastReadTime: 0,
              },
            ].slice(0, limit),
    })),
    getConversation: vi.fn(async (conversationId: string) => ({
      conversationId,
      type: 2,
      name: 'Design team',
      avatar: 'https://yx-web-nosdn.netease.im/team.png',
      stickTop: false,
      localExtension: '',
      serverExtension: '',
      unreadCount: 0,
      sortOrder: 4,
      createTime: 1,
      updateTime: 4,
      lastReadTime: 0,
    })),
    markConversationRead: vi.fn(async () => Date.now()),
  })
  let sendCount = 0
  const rawMessage = (text = 'history') => ({
    conversationId: 'c1',
    messageClientId: `m${sendCount + 1}`,
    messageServerId: `s${sendCount + 1}`,
    messageType: 0,
    senderId: 'account-a',
    receiverId: 'other',
    createTime: 2 + sendCount,
    isSelf: true,
    isDelete: false,
    sendingState: 1,
    conversationType: 1,
    messageStatus: { errorCode: 0 },
    text,
  })
  const message = Object.assign(new FakeService(), {
    getMessageListEx: vi.fn(async () => {
      const value = rawMessage()
      return { messages: [value], anchorMessage: value, hasMore: false }
    }),
    sendMessage: vi.fn(async (value: { text?: string; serverExtension?: string }) => {
      sendCount += 1
      return {
        message: {
          ...rawMessage(value.text),
          messageClientId: `sent-${sendCount}`,
          messageServerId: `server-${sendCount}`,
          serverExtension: value.serverExtension,
        },
      }
    }),
  })
  const user = Object.assign(new FakeService(), {
    getUserListFromCloud: vi.fn(async () => [
      {
        accountId: 'account-a',
        name: 'OIDC User',
        email: 'user@example.test',
        avatar: 'https://id.example.test/avatar.png',
        createTime: 1,
      },
    ]),
  })
  const sdk = {
    V2NIMLoginService: login,
    V2NIMConversationService: conversation,
    V2NIMMessageService: message,
    V2NIMUserService: user,
    V2NIMMessageCreator: { createTextMessage: (text: string) => rawMessage(text) },
    V2NIMConversationIdUtil: {
      parseConversationTargetId: (conversationId: string) =>
        conversationId.split('|').at(-1) ?? conversationId,
    },
    destroy: vi.fn(async () => undefined),
  }
  return { sdk, login, conversation, message, user }
}

const credentials: ManagedImCredentials = {
  appKey: 'app',
  account: 'account-a',
  token: 'token',
}

function credentialClient(value: ManagedImCredentials = credentials): ManagedImCredentialClient {
  return { load: vi.fn(async () => structuredClone(value)) }
}

function createTransport(
  factory: YunxinSdkFactory,
  client: ManagedImCredentialClient = credentialClient(),
): YunxinWebChannelTransport {
  return new YunxinWebChannelTransport(client, factory)
}

describe('YunxinWebChannelTransport', () => {
  it('resolves the SDK through the CommonJS wrappers produced by Vite', () => {
    const sdkConstructor = { getInstance: vi.fn() }

    expect(resolveYunxinSdkModule({ default: { default: sdkConstructor } })).toBe(sdkConstructor)
    expect(resolveYunxinSdkModule({ default: sdkConstructor })).toBe(sdkConstructor)
    expect(() => resolveYunxinSdkModule({ default: {} })).toThrow(/getInstance/)
  })

  it('maps SDK initialization failures into a stable failed status', async () => {
    const transport = createTransport({
      create: () => Promise.reject(new Error('sdk failed')),
    })

    await expect(transport.connect()).rejects.toMatchObject({ code: 'transport' })
    expect(transport.status()).toMatchObject({
      phase: 'failed',
      errorCode: 'sdkInitialization',
      retryable: false,
    })
  })

  it('keeps managed credentials out of status and events', async () => {
    const { sdk } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))

    await transport.connect()

    const projection = JSON.stringify({ status: transport.status(), events })
    expect(projection).not.toContain(credentials.appKey)
    expect(projection).not.toContain(credentials.account)
    expect(projection).not.toContain(credentials.token)
    expect(transport.status().accountRef).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects hostile provider error codes without publishing their content', async () => {
    const { sdk, login } = createFakeSdk()
    login.login.mockRejectedValueOnce({ code: 'secret-token\nwith-control-data' })
    const transport = createTransport({ create: () => sdk as never })

    await expect(transport.connect()).rejects.toMatchObject({ code: 'authentication' })
    expect(transport.status()).toMatchObject({ phase: 'failed', errorCode: 'unknown' })
    expect(JSON.stringify(transport.status())).not.toContain('secret-token')
  })

  it('satisfies the provider-neutral transport contract', async () => {
    const { sdk } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never } satisfies YunxinSdkFactory)
    await verifyTransportContract(transport)
    expect(sdk.V2NIMMessageService.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('loads the current account profile from the Yunxin cloud', async () => {
    const { sdk, user } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(transport.getSelfProfile()).resolves.toEqual({
      accountId: 'account-a',
      name: 'OIDC User',
      email: 'user@example.test',
      avatarUrl: 'https://id.example.test/avatar.png',
    })
    expect(user.getUserListFromCloud).toHaveBeenCalledWith(['account-a'])
    expect(transport.capabilities()).toContainEqual({ id: 'profile.self', available: true })
  })

  it('rejects a cloud profile for a different account', async () => {
    const { sdk, user } = createFakeSdk()
    user.getUserListFromCloud.mockResolvedValueOnce([
      {
        accountId: 'another-account',
        name: 'Another user',
        email: '',
        avatar: '',
        createTime: 1,
      },
    ])
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(transport.getSelfProfile()).rejects.toMatchObject({
      code: 'protocolFailure',
      retryable: false,
    })
  })

  it('rejects unsafe profile values returned by the provider', async () => {
    const { sdk, user } = createFakeSdk()
    user.getUserListFromCloud.mockResolvedValueOnce([
      {
        accountId: 'account-a',
        name: `Unsafe\n${'a'.repeat(64)}`,
        email: '',
        avatar: '',
        createTime: 1,
      },
    ])
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(transport.getSelfProfile()).rejects.toMatchObject({
      code: 'protocolFailure',
      retryable: false,
    })
  })

  it('maps reconnect and kicked-offline events and removes every listener', async () => {
    const { sdk, login, conversation, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()

    login.emit('onConnectStatus', 3)
    expect(transport.status().phase).toBe('reconnecting')
    login.emit('onConnectStatus', 1)
    expect(transport.status().phase).toBe('connected')
    login.emit('onKickedOffline', {})
    expect(transport.status().phase).toBe('kickedOffline')
    expect(
      events.some(
        (event) => event.type === 'status.changed' && event.status.phase === 'kickedOffline',
      ),
    ).toBe(true)

    await transport.dispose()
    expect(login.listenerCount() + conversation.listenerCount() + message.listenerCount()).toBe(0)
    expect(sdk.destroy).toHaveBeenCalledTimes(1)
  })

  it('maps provider message lifecycle events into serializable events', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()
    const refer = { conversationId: 'c1', messageClientId: 'm1', messageServerId: 's1' }
    message.emit('onMessageDeletedNotifications', [{ messageRefer: refer, deleteTime: 3 }])
    message.emit('onMessageRevokeNotifications', [{ messageRefer: refer }])
    message.emit('onClearHistoryNotifications', [{ conversationId: 'c1', deleteTime: 4 }])
    message.emit('onMessagePinNotification', { pinState: 1, pin: { messageRefer: refer } })
    message.emit('onReceiveTeamMessageReadReceipts', [{ ...refer, readCount: 2, unreadCount: 1 }])
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'message.deleted',
        'message.revoked',
        'message.historyCleared',
        'message.pinChanged',
        'message.receiptChanged',
      ]),
    )
    expect(() => JSON.stringify(events)).not.toThrow()
  })

  it('refreshes an incomplete newly created group before publishing its identity', async () => {
    const { sdk, conversation } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()

    conversation.emit('onConversationCreated', {
      conversationId: 'team|app|team-1',
      type: 2,
      stickTop: false,
      localExtension: '',
      serverExtension: '',
      unreadCount: 0,
      sortOrder: 3,
      createTime: 1,
      updateTime: 2,
      lastReadTime: 0,
    })

    await vi.waitFor(() =>
      expect(conversation.getConversation).toHaveBeenCalledWith('team|app|team-1'),
    )
    const event = events.find((value) => value.type === 'channel.upserted')
    expect(event).toMatchObject({
      type: 'channel.upserted',
      channels: [{ name: 'Design team', avatarUrl: 'https://yx-web-nosdn.netease.im/team.png' }],
    })
  })

  it('maps bidirectional pagination through getMessageListEx', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const first = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 2 })
    expect(first.nextAnchor).toEqual(first.items[0]!.ref)
    expect(message.getMessageListEx).toHaveBeenLastCalledWith(
      expect.objectContaining({ direction: 0 }),
    )

    const olderRaw = {
      conversationId: 'c1',
      messageClientId: 'older',
      messageServerId: 'older-server',
      messageType: 0,
      senderId: 'other',
      receiverId: 'account-a',
      createTime: 1,
      isSelf: false,
      isDelete: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: 'older',
    }
    const newerRaw = {
      ...olderRaw,
      messageClientId: 'newer',
      messageServerId: 'newer-server',
      createTime: 4,
      text: 'newer',
    }
    message.getMessageListEx.mockResolvedValueOnce({
      messages: [newerRaw, olderRaw],
      anchorMessage: newerRaw,
      hasMore: true,
    })
    const after = await transport.loadMessages({
      channelRef: 'c1',
      direction: 'after',
      limit: 2,
      anchorMessage: first.nextAnchor,
    })

    expect(message.getMessageListEx).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: 'c1',
        direction: 1,
        limit: 2,
      }),
    )
    expect(after.items.map((value) => value.ref.messageClientId)).toEqual(['older', 'newer'])
    expect(after.hasMore).toBe(true)
    expect(after.nextAnchor?.messageClientId).toBe('newer')
  })

  it('rejects an anchor that is not in provider memory', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(
      transport.loadMessages({
        channelRef: 'c1',
        direction: 'before',
        limit: 2,
        anchorMessage: { channelRef: 'c1', messageClientId: 'unknown' },
      }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    expect(message.getMessageListEx).not.toHaveBeenCalled()
  })

  it('reloads managed credentials and reconnects only when they rotate', async () => {
    const { sdk, login } = createFakeSdk()
    const client = credentialClient()
    const load = vi
      .mocked(client.load)
      .mockResolvedValueOnce({ ...credentials, token: 'token-a' })
      .mockResolvedValueOnce({ ...credentials, token: 'token-a' })
      .mockResolvedValueOnce({ ...credentials, token: 'token-b' })
    const transport = createTransport({ create: () => sdk as never }, client)

    await transport.connect()
    await transport.connect()
    expect(login.login).toHaveBeenCalledTimes(1)

    await transport.connect()
    expect(login.logout).toHaveBeenCalledTimes(1)
    expect(login.login).toHaveBeenLastCalledWith('account-a', 'token-b')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('redacts managed credential loading failures', async () => {
    const { sdk } = createFakeSdk()
    const client: ManagedImCredentialClient = {
      load: vi.fn(async () => Promise.reject(new Error('must-not-leak-secret'))),
    }
    const transport = createTransport({ create: () => sdk as never }, client)

    await expect(transport.connect()).rejects.toMatchObject({ code: 'notInitialized' })
    expect(JSON.stringify(transport.status())).not.toContain('must-not-leak-secret')
    expect(transport.status()).toMatchObject({
      phase: 'failed',
      errorCode: 'managedCredentialsUnavailable',
      retryable: false,
    })
  })

  it('cannot reconnect from a late credential result after disposal', async () => {
    const { sdk } = createFakeSdk()
    let resolveCredentials!: (value: ManagedImCredentials) => void
    const client: ManagedImCredentialClient = {
      load: vi.fn(
        () =>
          new Promise<ManagedImCredentials>((resolve) => {
            resolveCredentials = resolve
          }),
      ),
    }
    const factory = { create: vi.fn(() => sdk as never) }
    const transport = createTransport(factory, client)

    const connecting = transport.connect()
    await transport.dispose()
    resolveCredentials(credentials)

    await expect(connecting).rejects.toMatchObject({ code: 'disposed' })
    expect(factory.create).not.toHaveBeenCalled()
    expect(transport.status()).toEqual({ phase: 'disconnected', retryable: false })
  })

  it('clears local state even when the vendor SDK fails to destroy', async () => {
    const { sdk, login, conversation, message } = createFakeSdk()
    sdk.destroy.mockRejectedValueOnce(new Error('vendor destroy failed'))
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(transport.dispose()).resolves.toBeUndefined()
    expect(login.listenerCount() + conversation.listenerCount() + message.listenerCount()).toBe(0)
    expect(transport.status()).toEqual({ phase: 'disconnected', retryable: false })
    await expect(transport.connect()).rejects.toMatchObject({ code: 'disposed' })
  })
})
