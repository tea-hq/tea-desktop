import { describe, expect, it } from 'vitest'
import type { V2NIMConversation } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMConversationService'
import type { V2NIMMessage } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'
import {
  mapYunxinConversation,
  mapYunxinMessage,
  mapYunxinMessageContent,
  serializeServerExtension,
} from './yunxinMapper'

describe('Yunxin DTO mapping', () => {
  it('maps supported conversations without leaking source objects', () => {
    const source = {
      conversationId: 'p2p|a|b',
      type: 1,
      name: 'Alice',
      avatar: 'https://yx-web-nosdn.netease.im/alice.png',
      mute: true,
      stickTop: true,
      localExtension: '',
      serverExtension: '',
      unreadCount: 2,
      sortOrder: 3,
      createTime: 1,
      updateTime: 2,
      lastReadTime: 1,
      lastMessage: { text: 'Latest message' },
    } as V2NIMConversation
    const result = mapYunxinConversation(source, 'account-b')
    expect(result).toEqual(
      expect.objectContaining({
        ref: 'p2p|a|b',
        kind: 'direct',
        directAccountId: 'account-b',
        name: 'Alice',
        avatarUrl: 'https://yx-web-nosdn.netease.im/alice.png',
        muted: true,
        pinned: true,
        description: '',
        lastMessagePreview: 'Latest message',
        unreadCount: 2,
      }),
    )
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('uses the parsed target id instead of the encoded conversation id as the name fallback', () => {
    const source = {
      conversationId: 'p2p|a|account-b',
      type: 1,
      name: '',
      stickTop: false,
      localExtension: '',
      serverExtension: '',
      unreadCount: 0,
      sortOrder: 3,
      createTime: 1,
      updateTime: 2,
      lastReadTime: 0,
    } as V2NIMConversation

    expect(mapYunxinConversation(source, 'account-b')).toMatchObject({
      name: 'account-b',
      directAccountId: 'account-b',
    })
    expect(mapYunxinConversation({ ...source, type: 2 }, 'team-id')).not.toHaveProperty(
      'directAccountId',
    )
  })

  it('drops unsafe or unbounded avatar URLs', () => {
    const source = {
      conversationId: 'p2p|a|b',
      type: 1,
      name: 'Alice',
      stickTop: false,
      localExtension: '',
      serverExtension: '',
      unreadCount: 0,
      sortOrder: 3,
      createTime: 1,
      updateTime: 2,
      lastReadTime: 0,
    } as V2NIMConversation

    expect(
      mapYunxinConversation({ ...source, avatar: 'javascript:alert(1)' })?.avatarUrl,
    ).toBeUndefined()
    expect(
      mapYunxinConversation({ ...source, avatar: `https://example.com/${'x'.repeat(2_100)}` })
        ?.avatarUrl,
    ).toBeUndefined()
  })

  it('maps text messages and bounds unsafe extensions', () => {
    const source = {
      conversationId: 'c1',
      messageClientId: 'm1',
      messageServerId: 's1',
      messageType: 0,
      senderId: 'me',
      receiverId: 'other',
      createTime: 2,
      isSelf: true,
      isDelete: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: 'hello',
      serverExtension: JSON.stringify({
        version: 1,
        identity: 'tea-agent',
        teaDelivery: { version: 1, clientReference: 'im-send:v1:one' },
      }),
    } as V2NIMMessage
    expect(mapYunxinMessage(source, 'me')).toMatchObject({
      ref: { channelRef: 'c1', messageClientId: 'm1', messageServerId: 's1' },
      text: 'hello',
      sentByCurrentUser: true,
      serverExtension: {
        version: 1,
        identity: 'tea-agent',
        teaDelivery: { version: 1, clientReference: 'im-send:v1:one' },
      },
      clientReference: 'im-send:v1:one',
    })
    expect(mapYunxinMessage({ ...source, messageType: 1 } as V2NIMMessage, 'me')).toMatchObject({
      content: { kind: 'image', caption: 'hello' },
      text: 'hello',
    })
    expect(
      mapYunxinMessage(
        {
          ...source,
          serverExtension: JSON.stringify({
            teaDelivery: { version: 2, clientReference: 'unsupported' },
          }),
        } as V2NIMMessage,
        'me',
      )?.clientReference,
    ).toBeUndefined()
  })

  it('uses the provider self flag with an account fallback for restored messages', () => {
    const source = {
      conversationId: 'c1',
      messageClientId: 'm2',
      messageServerId: 's2',
      messageType: 0,
      senderId: 'me',
      receiverId: 'other',
      createTime: 3,
      isSelf: false,
      isDelete: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: 'restored',
    } as V2NIMMessage

    expect(mapYunxinMessage(source, 'me')?.sentByCurrentUser).toBe(true)
    expect(
      mapYunxinMessage({ ...source, senderId: 'other' } as V2NIMMessage, 'me')?.sentByCurrentUser,
    ).toBe(false)
  })

  it('normalizes every supported Yunxin content type without exposing SDK objects', () => {
    expect(
      mapYunxinMessageContent({
        messageType: 1,
        attachment: { url: 'https://a.test/i.png', name: 'i.png', width: 20, height: 10 },
      }),
    ).toEqual({
      kind: 'image',
      media: { url: 'https://a.test/i.png', name: 'i.png', width: 20, height: 10 },
    })
    expect(
      mapYunxinMessageContent({ messageType: 2, attachment: { duration: 1_200 } }),
    ).toMatchObject({ kind: 'audio', media: { durationMs: 1_200 } })
    expect(
      mapYunxinMessageContent({
        messageType: 3,
        attachment: { duration: 2_000, width: 800, height: 600 },
      }),
    ).toMatchObject({ kind: 'video', media: { durationMs: 2_000, width: 800, height: 600 } })
    expect(
      mapYunxinMessageContent({
        messageType: 4,
        attachment: { latitude: 1, longitude: 2, address: 'Office' },
      }),
    ).toEqual({ kind: 'location', latitude: 1, longitude: 2, address: 'Office' })
    expect(
      mapYunxinMessageContent({
        messageType: 5,
        attachment: { type: 3, targetIds: ['u1'], serverExtension: '{"kind":"team"}' },
      }),
    ).toEqual({
      kind: 'notification',
      notificationType: 3,
      targetIds: ['u1'],
      data: { kind: 'team' },
    })
    expect(
      mapYunxinMessageContent({ messageType: 6, attachment: { name: 'report.pdf', size: 12 } }),
    ).toMatchObject({ kind: 'file', media: { name: 'report.pdf', size: 12 } })
    expect(mapYunxinMessageContent({ messageType: 7, text: 'call' })).toEqual({
      kind: 'avchat',
      text: 'call',
    })
    expect(mapYunxinMessageContent({ messageType: 10, text: 'tip' })).toEqual({
      kind: 'tips',
      text: 'tip',
    })
    expect(
      mapYunxinMessageContent({
        messageType: 11,
        text: 'bot',
        attachment: { raw: '{"answer":true}' },
      }),
    ).toEqual({ kind: 'robot', text: 'bot', data: { answer: true } })
    expect(
      mapYunxinMessageContent({
        messageType: 12,
        attachment: {
          type: 1,
          channelId: 'ch',
          status: 2,
          durations: [{ accountId: 'u1', duration: 300 }],
          text: 'ended',
        },
      }),
    ).toEqual({
      kind: 'call',
      callType: 1,
      channelId: 'ch',
      status: 2,
      durations: [{ accountId: 'u1', durationMs: 300 }],
      text: 'ended',
    })
    expect(
      mapYunxinMessageContent({
        messageType: 100,
        subType: 7,
        text: 'custom',
        attachment: { raw: '{"v":1}' },
      }),
    ).toEqual({ kind: 'custom', subtype: 7, text: 'custom', raw: '{"v":1}', data: { v: 1 } })
    expect(mapYunxinMessageContent({ messageType: 999, subType: 2, text: 'future' })).toEqual({
      kind: 'unknown',
      providerType: 999,
      subtype: 2,
      text: 'future',
    })
  })

  it('maps merged-forward custom payloads and archived sender metadata', () => {
    const raw = JSON.stringify({
      type: 101,
      data: {
        abstracts: [{ userAccId: 'u1', senderNick: 'Alice', content: 'Decision' }],
        depth: 2,
        sessionId: 'team|source',
        sessionName: 'Design team',
        md5: 'checksum',
        url: 'https://yx.example.test/mergedMsgs.txt',
      },
    })
    expect(
      mapYunxinMessageContent({ messageType: 100, text: '[Chat history]', attachment: { raw } }),
    ).toEqual({
      kind: 'merged',
      sourceChannelName: 'Design team',
      abstracts: [{ senderAccountId: 'u1', senderName: 'Alice', text: 'Decision' }],
      depth: 2,
    })

    const archived = {
      conversationId: 'c1',
      messageClientId: 'm3',
      messageServerId: 's3',
      messageType: 0,
      senderId: 'u1',
      receiverId: 'other',
      createTime: 3,
      isSelf: false,
      isDelete: false,
      sendingState: 1,
      conversationType: 1,
      messageStatus: { errorCode: 0 },
      text: 'archived',
      serverExtension: JSON.stringify({
        mergedMessageNickKey: 'Alice',
        mergedMessageAvatarKey: 'https://yx.example.test/alice.png',
      }),
    } as V2NIMMessage
    expect(mapYunxinMessage(archived, 'me')?.sender).toEqual({
      id: 'u1',
      name: 'Alice',
      avatarUrl: 'https://yx.example.test/alice.png',
      isCurrentUser: false,
    })
  })

  it('rejects oversized or deeply nested outgoing extensions', () => {
    const nested = { a: { b: { c: { d: { e: { f: true } } } } } }
    expect(() => serializeServerExtension({ value: 'x'.repeat(5_000) })).toThrow(
      'serverExtensionTooLarge',
    )
    expect(() => serializeServerExtension(nested)).toThrow('serverExtensionTooDeep')
  })
})
