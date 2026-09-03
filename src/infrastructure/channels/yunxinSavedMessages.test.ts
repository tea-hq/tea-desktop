import { describe, expect, it } from 'vitest'

import {
  decodeYunxinSavedMessagePayload,
  encodeYunxinSavedMessagePayload,
  isYunxinMessageCollectionType,
  yunxinMessageCollectionType,
  yunxinSavedMessageUniqueId,
} from './yunxinSavedMessages'

describe('yunxinSavedMessages', () => {
  it('round-trips the versioned payload without exposing extra fields', () => {
    const encoded = encodeYunxinSavedMessagePayload({
      message: '{"messageClientId":"m1"}',
      sourceChannelName: 'Product',
      senderName: 'Lin',
      avatarUrl: 'https://example.test/avatar.png',
    })

    expect(JSON.parse(encoded)).toMatchObject({
      schema: 'tea.saved-message',
      version: 1,
      conversationName: 'Product',
    })
    expect(decodeYunxinSavedMessagePayload(encoded)).toEqual({
      message: '{"messageClientId":"m1"}',
      sourceChannelName: 'Product',
      senderName: 'Lin',
      avatarUrl: 'https://example.test/avatar.png',
    })
  })

  it('reads the released Yunxin UI Kit payload and rejects unknown versions', () => {
    expect(
      decodeYunxinSavedMessagePayload(
        JSON.stringify({ message: 'serialized', conversationName: 'Legacy channel' }),
      ),
    ).toEqual({ message: 'serialized', sourceChannelName: 'Legacy channel' })
    expect(
      decodeYunxinSavedMessagePayload(
        JSON.stringify({ schema: 'tea.saved-message', version: 2, message: 'serialized' }),
      ),
    ).toBeNull()
  })

  it('rejects malformed and unbounded payloads', () => {
    expect(decodeYunxinSavedMessagePayload('{')).toBeNull()
    expect(decodeYunxinSavedMessagePayload(JSON.stringify({ message: '' }))).toBeNull()
    expect(
      decodeYunxinSavedMessagePayload(JSON.stringify({ message: `value${'x'.repeat(120_000)}` })),
    ).toBeNull()
    expect(() => encodeYunxinSavedMessagePayload({ message: 'x'.repeat(120_001) })).toThrow(
      'invalidSavedMessagePayload',
    )
  })

  it('uses stable collection types and provider message identity', () => {
    expect(yunxinMessageCollectionType(0)).toBe(1_000)
    expect(isYunxinMessageCollectionType(1_100)).toBe(true)
    expect(isYunxinMessageCollectionType(1_101)).toBe(false)
    expect(
      yunxinSavedMessageUniqueId({
        conversationId: 'c1',
        messageClientId: 'm1',
        messageServerId: 'server-1',
      }),
    ).toBe('server-1')
    expect(
      yunxinSavedMessageUniqueId({
        conversationId: 'c1',
        messageClientId: 'm1',
        messageServerId: '',
      }),
    ).toBe('c1_m1')
  })
})
