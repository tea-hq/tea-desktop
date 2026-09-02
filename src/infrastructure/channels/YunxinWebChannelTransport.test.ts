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
import type { YunxinMergedArchiveLoader } from './yunxinMergedMessages'
import { decodeYunxinMergedMessagePayload } from './yunxinMergedMessages'
import { YUNXIN_PRESENCE_DURATION_SECONDS, YUNXIN_PRESENCE_RENEWAL_MS } from './yunxinPresence'

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
    createConversation: vi.fn(async (conversationId: string) => ({
      conversationId,
      type: 1,
      name: 'Contact',
      stickTop: false,
      localExtension: '',
      serverExtension: '',
      unreadCount: 0,
      sortOrder: 1,
      createTime: 1,
      updateTime: 1,
      lastReadTime: 0,
    })),
    markConversationRead: vi.fn(async () => Date.now()),
    stickTopConversation: vi.fn(async () => undefined),
    deleteConversation: vi.fn(async () => undefined),
  })
  let sendCount = 0
  let uploadedArchive = ''
  let collectionCount = 0
  let collections: Array<{
    collectionId: string
    collectionType: number
    collectionData: string
    uniqueId?: string
    createTime: number
    updateTime: number
  }> = []
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
    searchCloudMessagesEx: vi.fn(async () => {
      const value = rawMessage('search hit')
      return {
        count: 1,
        items: [{ conversationId: 'c1', messages: [value], count: 1 }],
        hasMore: false,
      }
    }),
    getPinnedMessageList: vi.fn(async () => {
      const value = rawMessage('pinned message')
      return [
        {
          messageRefer: {
            conversationId: value.conversationId,
            messageClientId: value.messageClientId,
            messageServerId: value.messageServerId,
            senderId: value.senderId,
            receiverId: value.receiverId,
            createTime: value.createTime,
            conversationType: value.conversationType,
          },
          opeartorId: 'account-a',
          createTime: 10,
          updateTime: 10,
        },
      ]
    }),
    getMessageListByRefers: vi.fn(async () => [rawMessage('pinned message')]),
    addCollection: vi.fn(
      async (params: { collectionType: number; collectionData: string; uniqueId?: string }) => {
        const existing = collections.find((value) => value.uniqueId === params.uniqueId)
        collectionCount += 1
        const value = {
          collectionId: existing?.collectionId ?? `collection-${collectionCount}`,
          ...params,
          createTime: existing?.createTime ?? collectionCount,
          updateTime: collectionCount,
        }
        collections = [
          value,
          ...collections.filter((candidate) => candidate.collectionId !== value.collectionId),
        ]
        return value
      },
    ),
    getCollectionListExByOption: vi.fn(
      async (option: { limit: number; anchorCollection?: { collectionId: string } }) => {
        const start = option.anchorCollection
          ? collections.findIndex(
              (value) => value.collectionId === option.anchorCollection?.collectionId,
            ) + 1
          : 0
        return {
          totalCount: collections.length,
          collectionList: collections.slice(start, start + option.limit),
        }
      },
    ),
    removeCollections: vi.fn(async (values: Array<{ collectionId: string }>) => {
      const ids = new Set(values.map((value) => value.collectionId))
      const before = collections.length
      collections = collections.filter((value) => !ids.has(value.collectionId))
      return before - collections.length
    }),
    sendMessage: vi.fn(
      async (
        value: ReturnType<typeof rawMessage> & {
          attachment?: { raw?: string }
          serverExtension?: string
        },
        channelRef: string,
      ) => {
        sendCount += 1
        return {
          message: {
            ...rawMessage(value.text),
            ...value,
            conversationId: channelRef,
            messageClientId: `sent-${sendCount}`,
            messageServerId: `server-${sendCount}`,
            serverExtension: value.serverExtension,
          },
        }
      },
    ),
    replyMessage: vi.fn(
      async (value: { text?: string }, original: ReturnType<typeof rawMessage>) => {
        sendCount += 1
        return {
          message: {
            ...rawMessage(value.text),
            messageClientId: `reply-${sendCount}`,
            messageServerId: `reply-server-${sendCount}`,
            threadReply: {
              senderId: original.senderId,
              receiverId: original.receiverId,
              messageClientId: original.messageClientId,
              messageServerId: original.messageServerId,
              createTime: original.createTime,
              conversationType: original.conversationType,
              conversationId: original.conversationId,
            },
          },
        }
      },
    ),
    modifyMessage: vi.fn(async () => undefined),
    deleteMessages: vi.fn(async () => undefined),
    revokeMessage: vi.fn(async () => undefined),
    pinMessage: vi.fn(async () => undefined),
    unpinMessage: vi.fn(async () => undefined),
    addQuickComment: vi.fn(async () => undefined),
    removeQuickComment: vi.fn(async () => undefined),
    voiceToText: vi.fn(async () => 'Review the release plan.'),
    sendP2PMessageReceipt: vi.fn(async (_message: ReturnType<typeof rawMessage>) => undefined),
    sendTeamMessageReceipts: vi.fn(async (_messages: ReturnType<typeof rawMessage>[]) => undefined),
    getTeamMessageReceiptDetail: vi.fn(async () => ({
      readReceipt: { readCount: 2, unreadCount: 1 },
      readAccountList: ['reader-a', 'reader-b'],
      unreadAccountList: ['reader-c'],
    })),
  })
  const user = Object.assign(new FakeService(), {
    getUserListFromCloud: vi.fn(async (_accountIds: string[]) => [
      {
        accountId: 'account-a',
        name: 'OIDC User',
        email: 'user@example.test',
        avatar: 'https://id.example.test/avatar.png',
        createTime: 1,
      },
    ]),
  })
  const friend = Object.assign(new FakeService(), {
    checkFriend: vi.fn(async (accountIds: string[]) =>
      Object.fromEntries(accountIds.map((accountId) => [accountId, accountId === 'existing'])),
    ),
    addFriend: vi.fn(async () => undefined),
  })
  const team = Object.assign(new FakeService(), {
    getTeamInfo: vi.fn(async () => ({
      teamId: 'design',
      teamType: 1,
      name: 'Design team',
      ownerAccountId: 'account-a',
      memberLimit: 200,
      memberCount: 2,
      intro: 'Design decisions',
      announcement: 'Keep decisions visible.',
      chatBannedMode: 0,
    })),
    getTeamMemberList: vi.fn(async () => ({
      finished: true,
      nextToken: '',
      memberList: [
        {
          teamId: 'design',
          teamType: 1,
          accountId: 'account-a',
          memberRole: 1,
          teamNick: 'Me',
          joinTime: 1,
          inTeam: true,
          chatBanned: false,
        },
      ],
    })),
  })
  const setting = Object.assign(new FakeService(), {
    getConversationMuteStatus: vi.fn(() => false),
    setP2PMessageMuteMode: vi.fn(async () => undefined),
    setTeamMessageMuteMode: vi.fn(async () => undefined),
  })
  const subscription = Object.assign(new FakeService(), {
    subscribeUserStatus: vi.fn(async (_request: { accountIds: string[] }) => [] as string[]),
    unsubscribeUserStatus: vi.fn(async (_request: { accountIds: string[] }) => [] as string[]),
  })
  const sdk = {
    V2NIMLoginService: login,
    V2NIMConversationService: conversation,
    V2NIMMessageService: message,
    V2NIMUserService: user,
    V2NIMFriendService: friend,
    V2NIMTeamService: team,
    V2NIMSettingService: setting,
    V2NIMSubscriptionService: subscription,
    V2NIMMessageCreator: {
      createTextMessage: (text: string) => rawMessage(text),
      createForwardMessage: vi.fn((value: ReturnType<typeof rawMessage>) => rawMessage(value.text)),
      createCustomMessage: vi.fn((text: string, raw: string) => ({
        ...rawMessage(text),
        messageType: 100,
        attachment: { raw },
      })),
    },
    V2NIMMessageConverter: {
      messageSerialization: vi.fn((value: ReturnType<typeof rawMessage>) => JSON.stringify(value)),
      messageDeserialization: vi.fn((value: string) => JSON.parse(value)),
    },
    V2NIMConversationIdUtil: {
      p2pConversationId: (accountId: string) => `p2p|${accountId}`,
      teamConversationId: (teamId: string) => `team|${teamId}`,
      parseConversationType: (conversationId: string) =>
        conversationId.startsWith('p2p|') ? 1 : 2,
      parseConversationTargetId: (conversationId: string) =>
        conversationId.split('|').at(-1) ?? conversationId,
    },
    V2NIMStorageService: {
      createUploadFileTask: vi.fn((params: { fileObj: File }) => ({
        taskId: 'upload-1',
        uploadParams: params,
      })),
      uploadFile: vi.fn(async (task: { uploadParams: { fileObj: File } }) => {
        uploadedArchive = await task.uploadParams.fileObj.text()
        return 'https://yx.example.test/mergedMsgs.txt'
      }),
    },
    version: '10.9.81',
    destroy: vi.fn(async () => undefined),
  }
  return {
    sdk,
    login,
    conversation,
    message,
    user,
    friend,
    team,
    setting,
    subscription,
    getUploadedArchive: () => uploadedArchive,
  }
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
  mergedArchiveLoader?: YunxinMergedArchiveLoader,
): YunxinWebChannelTransport {
  return new YunxinWebChannelTransport(
    client,
    factory,
    undefined,
    {
      isKnownContact: async () => true,
    },
    mergedArchiveLoader,
  )
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

  it('validates the complete presence replace set against Tea Center before SDK calls', async () => {
    const { sdk, subscription } = createFakeSdk()
    const directory = {
      isKnownContact: vi.fn(async (accountId: string) => accountId !== 'unknown'),
    }
    const transport = new YunxinWebChannelTransport(
      credentialClient(),
      { create: () => sdk as never },
      undefined,
      directory,
    )
    await transport.connect()

    await expect(transport.setPresenceSubscriptions(['known', 'unknown'])).rejects.toMatchObject({
      code: 'invalidRequest',
    })

    expect(directory.isKnownContact).toHaveBeenCalledTimes(2)
    expect(subscription.subscribeUserStatus).not.toHaveBeenCalled()
    expect(subscription.unsubscribeUserStatus).not.toHaveBeenCalled()
  })

  it('subscribes with immediate sync and emits provider-neutral availability', async () => {
    const { sdk, subscription } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()

    await transport.setPresenceSubscriptions(['lin'])
    subscription.emit('onUserStatusChanged', [
      { accountId: 'lin', statusType: 1, clientType: 1, publishTime: 10 },
      { accountId: 'other', statusType: 1, clientType: 1, publishTime: 11 },
    ])

    expect(subscription.subscribeUserStatus).toHaveBeenCalledWith({
      accountIds: ['lin'],
      duration: YUNXIN_PRESENCE_DURATION_SECONDS,
      immediateSync: true,
    })
    expect(events.filter((event) => event.type === 'presence.changed')).toEqual([
      expect.objectContaining({
        presences: [{ accountId: 'lin', availability: 'online', updatedAt: 10 }],
      }),
    ])
  })

  it('retains successful subscriptions and emits a stable retryable failure', async () => {
    const { sdk, subscription } = createFakeSdk()
    subscription.subscribeUserStatus.mockResolvedValueOnce(['meng'])
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()

    await expect(transport.setPresenceSubscriptions(['lin', 'meng'])).rejects.toMatchObject({
      code: 'transport',
      retryable: true,
    })
    subscription.emit('onUserStatusChanged', [
      { accountId: 'lin', statusType: 1, clientType: 1, publishTime: 10 },
      { accountId: 'meng', statusType: 1, clientType: 1, publishTime: 11 },
    ])

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'presence.subscriptionFailed',
        errorCode: 'presenceSubscriptionFailed',
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'presence.changed',
        presences: [{ accountId: 'lin', availability: 'online', updatedAt: 10 }],
      }),
    )
  })

  it('renews desired subscriptions and cancels renewal on disconnect', async () => {
    vi.useFakeTimers()
    try {
      const { sdk, subscription } = createFakeSdk()
      const transport = createTransport({ create: () => sdk as never })
      await transport.connect()
      await transport.setPresenceSubscriptions(['lin'])

      await vi.advanceTimersByTimeAsync(YUNXIN_PRESENCE_RENEWAL_MS)
      expect(subscription.subscribeUserStatus).toHaveBeenNthCalledWith(2, {
        accountIds: ['lin'],
        duration: YUNXIN_PRESENCE_DURATION_SECONDS,
        immediateSync: false,
      })

      await transport.disconnect()
      await vi.advanceTimersByTimeAsync(YUNXIN_PRESENCE_RENEWAL_MS)
      expect(subscription.subscribeUserStatus).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes the presence listener and rejects stale events across reconnects', async () => {
    const { sdk, subscription } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()
    await transport.setPresenceSubscriptions(['lin'])
    const staleListener = [...(subscription.listeners.get('onUserStatusChanged') ?? [])][0] as
      ((values: unknown[]) => void) | undefined

    await transport.disconnect()
    staleListener?.([{ accountId: 'lin', statusType: 1, clientType: 1, publishTime: 10 }])

    expect(subscription.listeners.get('onUserStatusChanged')?.size ?? 0).toBe(0)
    expect(events.some((event) => event.type === 'presence.changed')).toBe(false)
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

  it('automatically creates the Yunxin friend relation before opening a P2P conversation', async () => {
    const { sdk, friend, conversation } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(transport.openDirectConversation('new-contact')).resolves.toBe('p2p|new-contact')
    expect(friend.checkFriend).toHaveBeenCalledWith(['new-contact'])
    expect(friend.addFriend).toHaveBeenCalledWith('new-contact', {
      addMode: 1,
      postscript: '',
    })
    expect(conversation.createConversation).toHaveBeenCalledWith('p2p|new-contact')
  })

  it('does not add an existing Yunxin friend again', async () => {
    const { sdk, friend } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await transport.openDirectConversation('existing')
    expect(friend.addFriend).not.toHaveBeenCalled()
  })

  it('rejects a direct contact that is absent from the Tea Center directory', async () => {
    const { sdk, friend } = createFakeSdk()
    const directory = { isKnownContact: vi.fn(async () => false) }
    const transport = new YunxinWebChannelTransport(
      credentialClient(),
      { create: () => sdk as never },
      undefined,
      directory,
    )
    await transport.connect()

    await expect(transport.openDirectConversation('unknown-contact')).rejects.toMatchObject({
      code: 'invalidRequest',
    })
    expect(directory.isKnownContact).toHaveBeenCalledWith('unknown-contact')
    expect(friend.checkFriend).not.toHaveBeenCalled()
  })

  it('fails closed when a Center directory is not configured', async () => {
    const { sdk, friend } = createFakeSdk()
    const transport = new YunxinWebChannelTransport(credentialClient(), {
      create: () => sdk as never,
    })
    await transport.connect()

    await expect(transport.openDirectConversation('existing')).rejects.toMatchObject({
      code: 'invalidRequest',
    })
    expect(friend.checkFriend).not.toHaveBeenCalled()
  })

  it('validates group targets against the Tea Center directory before Yunxin calls', async () => {
    const { sdk, team } = createFakeSdk()
    const directory = {
      isKnownContact: vi.fn(async (accountId: string) => accountId !== 'blocked'),
    }
    const transport = new YunxinWebChannelTransport(
      credentialClient(),
      { create: () => sdk as never },
      undefined,
      directory,
    )
    await transport.connect()

    await expect(
      transport.createGroup({ name: 'Project', memberAccountIds: ['blocked'] }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    await expect(
      transport.inviteGroupMembers({ channelRef: 'team|design', accountIds: ['blocked'] }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    expect(directory.isKnownContact).toHaveBeenNthCalledWith(1, 'blocked')
    expect(directory.isKnownContact).toHaveBeenNthCalledWith(2, 'blocked')
    expect((team as unknown as Record<string, unknown>).createTeam).toBeUndefined()
    expect((team as unknown as Record<string, unknown>).inviteMember).toBeUndefined()
  })

  it('keeps message mutations behind the provider-neutral request types', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const page = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 2 })
    const messageRef = page.items[0]!.ref

    await transport.modifyMessage({ messageRef, text: 'edited' })
    await transport.pinMessage({ messageRef, pinned: true })
    await transport.pinMessage({ messageRef, pinned: false })
    await transport.quickComment({ messageRef, type: 1, active: true })
    await transport.quickComment({ messageRef, type: 1, active: false })
    await transport.revokeMessage({ messageRef, postscript: 'updated' })
    await transport.deleteMessages({ messageRefs: [messageRef] })

    expect(message.modifyMessage).toHaveBeenCalledWith(expect.anything(), { text: 'edited' })
    expect(message.pinMessage).toHaveBeenCalledOnce()
    expect(message.unpinMessage).toHaveBeenCalledOnce()
    expect(message.addQuickComment).toHaveBeenCalledWith(expect.anything(), 1)
    expect(message.removeQuickComment).toHaveBeenCalledWith(expect.anything(), 1)
    expect(message.revokeMessage).toHaveBeenCalledWith(expect.anything(), { postscript: 'updated' })
    expect(message.deleteMessages).toHaveBeenCalledWith([expect.anything()])
  })

  it('translates cached voice messages without exposing provider attachment fields', async () => {
    const { sdk, message } = createFakeSdk()
    const voice = {
      conversationId: 'c1',
      messageClientId: 'voice-client',
      messageServerId: 'voice-server',
      messageType: 2,
      senderId: 'other',
      receiverId: 'account-a',
      createTime: 5,
      isSelf: false,
      isDelete: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: '',
      attachment: {
        url: 'https://cdn.example.test/voice.aac',
        duration: 2_400,
        sceneName: 'nim_voice',
      },
    }
    message.getMessageListEx.mockResolvedValueOnce({
      messages: [voice],
      anchorMessage: voice,
      hasMore: false,
    })
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const page = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 2 })

    await expect(transport.transcribeVoice(page.items[0]!.ref)).resolves.toBe(
      'Review the release plan.',
    )
    expect(message.voiceToText).toHaveBeenCalledWith({
      voiceUrl: 'https://cdn.example.test/voice.aac',
      duration: 2_400,
      mimeType: 'aac',
      sampleRate: '16000',
      sceneName: 'nim_voice',
    })

    message.voiceToText.mockResolvedValueOnce(' ')
    await expect(transport.transcribeVoice(page.items[0]!.ref)).rejects.toMatchObject({
      code: 'protocolFailure',
      retryable: false,
    })
    message.voiceToText.mockRejectedValueOnce(new Error('secret voice URL'))
    await expect(transport.transcribeVoice(page.items[0]!.ref)).rejects.toMatchObject({
      code: 'transport',
      retryable: true,
      message: 'transport',
    })
  })

  it('resolves cached media through a provider-neutral source contract', async () => {
    const { sdk, message } = createFakeSdk()
    const mediaMessages = [
      {
        messageClientId: 'image-client',
        messageServerId: 'image-server',
        messageType: 1,
        attachment: {
          url: 'https://cdn.example.test/design.png',
          name: 'design.png',
          size: 42,
          ext: 'png',
        },
      },
      {
        messageClientId: 'video-client',
        messageServerId: 'video-server',
        messageType: 3,
        attachment: {
          url: 'https://cdn.example.test/demo.mp4',
          size: 84,
          ext: '.mp4',
        },
      },
      {
        messageClientId: 'file-client',
        messageServerId: 'file-server',
        messageType: 6,
        attachment: {
          url: 'https://cdn.example.test/notes.txt',
          name: 'notes.txt',
        },
      },
      {
        messageClientId: 'voice-client',
        messageServerId: 'voice-server',
        messageType: 2,
        attachment: { url: 'https://cdn.example.test/voice.aac', ext: 'aac' },
      },
    ].map((value, index) => ({
      conversationId: 'c1',
      senderId: 'other',
      receiverId: 'account-a',
      createTime: index + 10,
      isSelf: false,
      isDelete: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: '',
      ...value,
    }))
    message.getMessageListEx.mockResolvedValueOnce({
      messages: mediaMessages,
      anchorMessage: mediaMessages[0],
      hasMore: false,
    })
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const page = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 10 })
    const refs = new Map(page.items.map((item) => [item.content.kind, item.ref]))

    expect(transport.resolveMediaSource(refs.get('image')!)).toEqual({
      url: 'https://cdn.example.test/design.png',
      fileName: 'design.png',
      expectedSize: 42,
    })
    expect(transport.resolveMediaSource(refs.get('video')!)).toEqual({
      url: 'https://cdn.example.test/demo.mp4',
      fileName: 'video.mp4',
      expectedSize: 84,
    })
    expect(transport.resolveMediaSource(refs.get('file')!)).toEqual({
      url: 'https://cdn.example.test/notes.txt',
      fileName: 'notes.txt',
    })
    expect(transport.resolveMediaSource(refs.get('audio')!)).toEqual({
      url: 'https://cdn.example.test/voice.aac',
      fileName: 'audio.aac',
    })
  })

  it('rejects missing, deleted, non-media, and URL-less cached messages', async () => {
    const { sdk, message } = createFakeSdk()
    const base = {
      conversationId: 'c1',
      senderId: 'other',
      receiverId: 'account-a',
      createTime: 10,
      isSelf: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: '',
    }
    const messages = [
      {
        ...base,
        messageClientId: 'text-client',
        messageServerId: 'text-server',
        messageType: 0,
        isDelete: false,
        text: 'not media',
      },
      {
        ...base,
        messageClientId: 'url-less-client',
        messageServerId: 'url-less-server',
        messageType: 1,
        isDelete: false,
        attachment: { name: 'missing.png' },
      },
      {
        ...base,
        messageClientId: 'deleted-client',
        messageServerId: 'deleted-server',
        messageType: 6,
        isDelete: true,
        attachment: { url: 'https://cdn.example.test/deleted.txt' },
      },
    ]
    message.getMessageListEx.mockResolvedValueOnce({
      messages,
      anchorMessage: messages[0],
      hasMore: false,
    })
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 10 })

    expect(() =>
      transport.resolveMediaSource({ channelRef: 'c1', messageClientId: 'missing-client' }),
    ).toThrowError(expect.objectContaining({ code: 'messageUnavailable', retryable: false }))
    expect(() =>
      transport.resolveMediaSource({ channelRef: 'c1', messageClientId: 'deleted-client' }),
    ).toThrowError(expect.objectContaining({ code: 'messageUnavailable', retryable: false }))
    expect(() =>
      transport.resolveMediaSource({ channelRef: 'c1', messageClientId: 'text-client' }),
    ).toThrowError(expect.objectContaining({ code: 'mediaUnavailable', retryable: false }))
    expect(() =>
      transport.resolveMediaSource({ channelRef: 'c1', messageClientId: 'url-less-client' }),
    ).toThrowError(expect.objectContaining({ code: 'mediaUnavailable', retryable: false }))
  })

  it('maps reply and ordinary forwarding to provider calls', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const page = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 2 })
    const messageRef = page.items[0]!.ref

    await transport.replyMessage({
      channelRef: 'c1',
      replyTo: messageRef,
      content: { kind: 'text', text: 'reply' },
    })
    await transport.forwardMessage({
      messageRefs: [messageRef],
      targetChannelRefs: ['team|design'],
      mode: 'individual',
    })

    expect(message.replyMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ messageConfig: { readReceiptEnabled: true } }),
    )
    expect(message.sendMessage).toHaveBeenCalledTimes(1)
    expect(sdk.V2NIMMessageCreator.createForwardMessage).toHaveBeenCalledWith(expect.anything())
  })

  it('encodes provider-neutral mentions only inside the Yunxin adapter', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await transport.sendMessage({
      channelRef: 'team|design',
      content: { kind: 'text', text: '@Lin review this' },
      mentions: [
        {
          target: { kind: 'user', accountId: 'lin' },
          label: '@Lin',
          ranges: [{ start: 0, end: 4 }],
        },
      ],
      serverExtension: { source: 'tea' },
      idempotencyKey: 'im-send:v1:mention',
    })

    const outgoing = message.sendMessage.mock.calls[0]![0]
    expect(JSON.parse(outgoing.serverExtension ?? '{}')).toEqual({
      source: 'tea',
      teaDelivery: { version: 1, clientReference: 'im-send:v1:mention' },
      yxAitMsg: {
        lin: { text: '@Lin', segments: [{ start: 0, end: 4, broken: false }] },
      },
    })
  })

  it('loads team receipt details and keeps account ids when profile enrichment is partial', async () => {
    const { sdk, message, user } = createFakeSdk()
    user.getUserListFromCloud.mockImplementation(async (accountIds: string[]) =>
      accountIds
        .filter((accountId) => accountId !== 'reader-c')
        .map((accountId) => ({
          accountId,
          name: `Profile ${accountId}`,
          email: '',
          avatar: '',
          createTime: 1,
        })),
    )
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const sent = await transport.sendMessage({
      channelRef: 'team|design',
      content: { kind: 'text', text: 'receipt detail' },
    })

    await expect(transport.getMessageReceiptDetails(sent.ref)).resolves.toEqual({
      messageRef: sent.ref,
      read: [
        { id: 'reader-a', name: 'Profile reader-a', isCurrentUser: false },
        { id: 'reader-b', name: 'Profile reader-b', isCurrentUser: false },
      ],
      unread: [{ id: 'reader-c', name: 'reader-c', isCurrentUser: false }],
      readCount: 2,
      unreadCount: 1,
    })
    expect(message.getTeamMessageReceiptDetail).toHaveBeenCalledWith(expect.anything())
    expect(user.getUserListFromCloud).toHaveBeenCalledWith(['reader-a', 'reader-b', 'reader-c'])
  })

  it('marks conversations read and sends the matching provider receipt batch', async () => {
    const { sdk, message, conversation } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const raw = (await message.getMessageListEx()).messages[0]
    const incoming = Array.from({ length: 55 }, (_, index) => ({
      ...raw,
      conversationId: 'team|design',
      conversationType: 2,
      messageClientId: `incoming-${index}`,
      messageServerId: `incoming-server-${index}`,
      senderId: 'member-a',
      isSelf: false,
      createTime: index + 1,
    }))
    message.emit('onReceiveMessages', incoming)

    await transport.markRead('team|design')

    expect(conversation.markConversationRead).toHaveBeenCalledWith('team|design')
    expect(message.sendTeamMessageReceipts).toHaveBeenCalledOnce()
    expect(message.sendTeamMessageReceipts.mock.calls[0]![0]).toHaveLength(50)
    expect(message.sendTeamMessageReceipts.mock.calls[0]![0][0]).toMatchObject({
      messageClientId: 'incoming-5',
    })
  })

  it('translates provider-neutral conversation controls into exact SDK operations', async () => {
    const { sdk, conversation, setting } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await transport.setChannelPinned('p2p|alice', true)
    await transport.setChannelMuted('p2p|alice', true)
    await transport.setChannelMuted('team|design', false)
    await transport.hideChannel('team|design')

    expect(conversation.stickTopConversation).toHaveBeenCalledWith('p2p|alice', true)
    expect(setting.setP2PMessageMuteMode).toHaveBeenCalledWith('alice', 1)
    expect(setting.setTeamMessageMuteMode).toHaveBeenCalledWith('design', 1, 0)
    expect(conversation.deleteConversation).toHaveBeenCalledWith('team|design', false)
  })

  it('uploads an interoperable merged archive and loads it through the converter', async () => {
    const { sdk, message, getUploadedArchive } = createFakeSdk()
    const loader = { load: vi.fn(async () => getUploadedArchive()) }
    const transport = createTransport({ create: () => sdk as never }, credentialClient(), loader)
    await transport.connect()
    const page = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 2 })
    const source = page.items[0]!

    const result = await transport.forwardMessage({
      messageRefs: [source.ref],
      targetChannelRefs: ['team|design'],
      mode: 'merged',
      sourceChannelName: 'Source channel',
      comment: 'Review this',
    })

    expect(result.messages).toHaveLength(2)
    expect(sdk.V2NIMStorageService.uploadFile).toHaveBeenCalledOnce()
    expect(getUploadedArchive().split('\n')).toHaveLength(2)
    const createCustomMessage = sdk.V2NIMMessageCreator.createCustomMessage
    const payload = decodeYunxinMergedMessagePayload(createCustomMessage.mock.calls[0]![1])
    expect(payload).toMatchObject({
      type: 101,
      data: { depth: 1, sessionId: 'c1', sessionName: 'Source channel' },
    })
    expect(await transport.loadMergedMessages(result.messages[0]!.ref)).toMatchObject([
      { ref: source.ref, text: source.text },
    ])
    expect(loader.load).toHaveBeenCalledWith('https://yx.example.test/mergedMsgs.txt')
    expect(message.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('rejects a merged archive whose checksum no longer matches', async () => {
    const { sdk } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never }, credentialClient(), {
      load: vi.fn(async () => 'tampered'),
    })
    await transport.connect()
    const page = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 2 })
    const result = await transport.forwardMessage({
      messageRefs: [page.items[0]!.ref],
      targetChannelRefs: ['team|design'],
      mode: 'merged',
    })

    await expect(transport.loadMergedMessages(result.messages[0]!.ref)).rejects.toMatchObject({
      code: 'protocolFailure',
    })
  })

  it('maps an oversized merged archive to a non-retryable protocol failure', async () => {
    const { sdk } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never }, credentialClient(), {
      load: vi.fn(async () => {
        throw new Error('mergedMessageArchiveTooLarge')
      }),
    })
    await transport.connect()
    const page = await transport.loadMessages({ channelRef: 'c1', direction: 'before', limit: 2 })
    const result = await transport.forwardMessage({
      messageRefs: [page.items[0]!.ref],
      targetChannelRefs: ['team|design'],
      mode: 'merged',
    })

    await expect(transport.loadMergedMessages(result.messages[0]!.ref)).rejects.toMatchObject({
      code: 'protocolFailure',
      retryable: false,
    })
  })

  it('resolves media tokens inside the adapter and publishes upload progress', async () => {
    const { sdk, message } = createFakeSdk()
    const createImageMessage = vi.fn((file: string, name?: string) => ({
      conversationId: 'c1',
      messageClientId: 'pending-image',
      messageServerId: '',
      messageType: 1,
      senderId: 'account-a',
      receiverId: 'other',
      createTime: 3,
      isSelf: true,
      isDelete: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: '',
      attachment: { url: 'https://cdn.example.test/design.png', name: name ?? file },
    }))
    Object.assign(sdk.V2NIMMessageCreator, {
      createImageMessage,
    })
    const resolver = {
      resolve: vi.fn(async (token: string) =>
        token === 'file-token'
          ? { path: '/private/design.png', name: 'design.png', mimeType: 'image/png' }
          : null,
      ),
      release: vi.fn(),
    }
    const transport = new YunxinWebChannelTransport(
      credentialClient(),
      { create: () => sdk as never },
      resolver,
      { isKnownContact: async () => true },
    )
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()
    const raw = (await sdk.V2NIMMessageService.getMessageListEx()).messages[0]
    message.sendMessage.mockImplementationOnce((async (...args: unknown[]) => {
      const progress = args[3] as ((value: number) => void) | undefined
      progress?.(42)
      progress?.(100)
      return {
        message: {
          ...raw,
          messageType: 1,
          attachment: { url: 'https://cdn.example.test/design.png', name: 'design.png' },
        },
      }
    }) as never)

    await transport.sendMessage({
      channelRef: 'c1',
      content: {
        kind: 'image',
        media: { source: { kind: 'localFile', token: 'file-token' }, name: 'design.png' },
      },
      operationId: 'upload-1',
    })

    expect(resolver.resolve).toHaveBeenCalledWith('file-token')
    expect(resolver.release).not.toHaveBeenCalled()
    expect(createImageMessage).toHaveBeenCalledWith(
      '/private/design.png',
      'design.png',
      undefined,
      undefined,
      undefined,
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message.sendProgress',
        operationId: 'upload-1',
        progress: 42,
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message.sendProgress',
        operationId: 'upload-1',
        progress: 100,
      }),
    )
  })

  it('maps unknown SDK send failures to a stable retryable transport error', async () => {
    const { sdk, message } = createFakeSdk()
    message.sendMessage.mockRejectedValueOnce({ code: 50_000, message: 'vendor failure' })
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(
      transport.sendMessage({ channelRef: 'c1', content: { kind: 'text', text: 'retry' } }),
    ).rejects.toMatchObject({ code: 'transport', retryable: true })
  })

  it('keeps group details and members behind the Yunxin adapter', async () => {
    const { sdk, team } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(transport.getChannelDetails('team|design')).resolves.toMatchObject({
      channelRef: 'team|design',
      name: 'Design team',
      ownerAccountId: 'account-a',
      memberCount: 2,
    })
    await expect(
      transport.listChannelMembers({ channelRef: 'team|design', limit: 50 }),
    ).resolves.toMatchObject({
      channelRef: 'team|design',
      items: [{ accountId: 'account-a', role: 'owner' }],
      hasMore: false,
    })
    expect(team.getTeamInfo).toHaveBeenCalledWith('design', 1)
    expect(team.getTeamMemberList).toHaveBeenCalledWith(
      'design',
      1,
      expect.objectContaining({ roleQueryType: 0, limit: 50 }),
    )
  })

  it('keeps group management behind provider-neutral requests', async () => {
    const { sdk, conversation } = createFakeSdk()
    // The fake service intentionally models only the methods used by this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = sdk.V2NIMTeamService as unknown as Record<string, any>
    team.createTeam = vi.fn(async (params: Record<string, unknown>, invitees: string[]) => ({
      team: {
        teamId: 'new-team',
        teamType: 1,
        name: params.name,
        intro: params.intro ?? '',
        announcement: params.announcement ?? '',
        memberCount: invitees.length + 1,
        ownerAccountId: 'account-a',
        memberLimit: 200,
        chatBannedMode: 0,
      },
      failedList: [],
    }))
    team.updateTeamInfo = vi.fn(async () => undefined)
    team.inviteMember = vi.fn(async () => ['not-found'])
    team.kickMember = vi.fn(async () => undefined)
    team.leaveTeam = vi.fn(async () => undefined)
    team.dismissTeam = vi.fn(async () => undefined)
    team.updateTeamMemberRole = vi.fn(async () => undefined)
    team.setTeamMemberChatBannedStatus = vi.fn(async () => undefined)
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(
      transport.createGroup({
        name: 'New team',
        memberAccountIds: ['member-a'],
        description: 'Shared work',
        announcement: 'Keep decisions visible.',
      }),
    ).resolves.toMatchObject({ ref: 'team|new-team', kind: 'group', memberCount: 2 })
    await transport.updateGroup({
      channelRef: 'team|design',
      name: 'Design v2',
      chatBanned: true,
    })
    await expect(
      transport.inviteGroupMembers({ channelRef: 'team|design', accountIds: ['member-a'] }),
    ).resolves.toEqual({ failedAccountIds: ['not-found'] })
    await transport.removeGroupMembers({ channelRef: 'team|design', accountIds: ['member-a'] })
    await transport.setGroupMemberRole({
      channelRef: 'team|design',
      accountIds: ['member-a'],
      role: 'manager',
    })
    await transport.setGroupMemberMute({
      channelRef: 'team|design',
      accountId: 'member-a',
      chatBanned: true,
    })

    expect(conversation.createConversation).toHaveBeenCalledWith('team|new-team')
    expect(team.updateTeamInfo).toHaveBeenCalledWith(
      'design',
      1,
      expect.objectContaining({ name: 'Design v2', chatBannedMode: 1 }),
    )
    expect(team.kickMember).toHaveBeenCalledWith('design', 1, ['member-a'])
    expect(team.updateTeamMemberRole).toHaveBeenCalledWith('design', 1, ['member-a'], 2)
    expect(team.setTeamMemberChatBannedStatus).toHaveBeenCalledWith('design', 1, 'member-a', true)
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

  it('uses the conversation sync lifecycle as the channel catalog boundary', async () => {
    const { sdk, login, conversation } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    const events: ChannelEvent[] = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()

    login.emit('onDataSync', 1, 3)
    expect(events.some((event) => event.type === 'sync.finished')).toBe(false)

    conversation.emit('onSyncStarted')
    conversation.emit('onSyncFinished')
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['sync.started', 'sync.finished']),
    )
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

  it('maps cloud search results without exposing Yunxin response groups', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(
      transport.searchMessages({ channelRef: 'c1', keyword: 'search', limit: 20 }),
    ).resolves.toMatchObject({
      totalCount: 1,
      hasMore: false,
      items: [{ ref: { channelRef: 'c1' }, text: 'search hit' }],
    })
    expect(message.searchCloudMessagesEx).toHaveBeenCalledWith({
      conversationId: 'c1',
      keywordList: ['search'],
      limit: 20,
      direction: 0,
    })
  })

  it('resolves pinned references into provider-neutral messages', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()

    await expect(transport.listPinnedMessages('c1')).resolves.toMatchObject([
      {
        message: { ref: { channelRef: 'c1' }, text: 'pinned message', pinned: true },
        pinnedByAccountId: 'account-a',
        pinnedAt: 10,
      },
    ])
    expect(message.getPinnedMessageList).toHaveBeenCalledWith('c1')
    expect(message.getMessageListByRefers).toHaveBeenCalledWith([
      expect.objectContaining({ conversationId: 'c1' }),
    ])
  })

  it('saves, pages, and removes provider-neutral saved messages', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const history = await transport.loadMessages({
      channelRef: 'c1',
      direction: 'before',
      limit: 1,
    })

    const saved = await transport.saveMessage({
      messageRef: history.items[0]!.ref,
      sourceChannelName: 'Product',
    })
    const duplicate = await transport.saveMessage({ messageRef: history.items[0]!.ref })
    const page = await transport.listSavedMessages({ limit: 1 })

    expect(duplicate.id).toBe(saved.id)
    expect(page).toMatchObject({
      totalCount: 1,
      hasMore: false,
      items: [{ id: saved.id, message: { text: 'history' } }],
    })
    expect(message.getCollectionListExByOption).toHaveBeenCalledWith({
      collectionType: 0,
      direction: 0,
      limit: 1,
    })
    await transport.removeSavedMessage(saved.id)
    await expect(transport.listSavedMessages({ limit: 10 })).resolves.toMatchObject({
      totalCount: 0,
      items: [],
    })
  })

  it('maps the provider collection limit to a stable error code', async () => {
    const { sdk, message } = createFakeSdk()
    const transport = createTransport({ create: () => sdk as never })
    await transport.connect()
    const history = await transport.loadMessages({
      channelRef: 'c1',
      direction: 'before',
      limit: 1,
    })
    message.addCollection.mockRejectedValueOnce({ code: 189301 })

    await expect(
      transport.saveMessage({ messageRef: history.items[0]!.ref }),
    ).rejects.toMatchObject({ code: 'limitExceeded', retryable: false })
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
