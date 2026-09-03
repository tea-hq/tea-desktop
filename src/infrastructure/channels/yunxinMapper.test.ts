import { describe, expect, it } from 'vitest'
import type { V2NIMConversation } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMConversationService'
import type { V2NIMMessage } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'
import { mapYunxinConversation, mapYunxinMessage, serializeServerExtension } from './yunxinMapper'

describe('Yunxin DTO mapping', () => {
  it('maps supported conversations without leaking source objects', () => {
    const source = {
      conversationId: 'p2p|a|b',
      type: 1,
      name: 'Alice',
      avatar: 'https://yx-web-nosdn.netease.im/alice.png',
      stickTop: false,
      localExtension: '',
      serverExtension: '',
      unreadCount: 2,
      sortOrder: 3,
      createTime: 1,
      updateTime: 2,
      lastReadTime: 1,
    } as V2NIMConversation
    const result = mapYunxinConversation(source, 'b')
    expect(result).toEqual(
      expect.objectContaining({
        ref: 'p2p|a|b',
        kind: 'direct',
        name: 'Alice',
        participantAccountId: 'b',
        avatarUrl: 'https://yx-web-nosdn.netease.im/alice.png',
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

    expect(mapYunxinConversation(source, 'account-b')?.name).toBe('account-b')
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
      serverExtension: JSON.stringify({ version: 1, identity: 'tea-agent' }),
    } as V2NIMMessage
    expect(mapYunxinMessage(source, 'me')).toMatchObject({
      ref: { channelRef: 'c1', messageClientId: 'm1', messageServerId: 's1' },
      text: 'hello',
      sentByCurrentUser: true,
      serverExtension: { version: 1, identity: 'tea-agent' },
    })
    expect(mapYunxinMessage({ ...source, messageType: 1 } as V2NIMMessage, 'me')).toBeNull()
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

  it('rejects oversized or deeply nested outgoing extensions', () => {
    const nested = { a: { b: { c: { d: { e: { f: true } } } } } }
    expect(() => serializeServerExtension({ value: 'x'.repeat(5_000) })).toThrow(
      'serverExtensionTooLarge',
    )
    expect(() => serializeServerExtension(nested)).toThrow('serverExtensionTooDeep')
  })
})
