import { afterEach, describe, expect, it, vi } from 'vitest'
import type { V2NIMMessage } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'
import {
  decodeYunxinMergedMessagePayload,
  defaultYunxinMergedArchiveLoader,
  deserializeYunxinMergedArchive,
  encodeYunxinMergedMessagePayload,
  normalizeYunxinMergedArchive,
  serializeYunxinMergedArchive,
  YUNXIN_MERGED_ARCHIVE_LIMIT,
  yunxinMergedArchiveMd5,
} from './yunxinMergedMessages'

const rawMessage = {
  conversationId: 'team|source',
  messageClientId: 'm1',
  messageServerId: '12',
  messageType: 0,
  senderId: 'u1',
  receiverId: 'team',
  createTime: 1,
  isSelf: false,
  isDelete: false,
  sendingState: 1,
  conversationType: 2,
  messageStatus: { errorCode: 0 },
  text: 'hello',
} as V2NIMMessage

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Yunxin merged messages', () => {
  it('encodes and validates the released type-101 card shape', () => {
    const raw = encodeYunxinMergedMessagePayload({
      abstracts: [{ senderAccountId: 'u1', senderName: 'Alice', text: 'hello' }],
      depth: 2,
      md5: 'b'.repeat(32),
      sessionId: 'source',
      sessionName: 'Design',
      url: 'https://yx.example.test/mergedMsgs.txt',
    })
    expect(decodeYunxinMergedMessagePayload(raw)).toEqual({
      type: 101,
      data: {
        abstracts: [{ userAccId: 'u1', senderNick: 'Alice', content: 'hello' }],
        depth: 2,
        md5: 'b'.repeat(32),
        sessionId: 'source',
        sessionName: 'Design',
        url: 'https://yx.example.test/mergedMsgs.txt',
      },
    })
    expect(decodeYunxinMergedMessagePayload(raw.replace('https://', 'http://'))).toBeNull()
    expect(() =>
      encodeYunxinMergedMessagePayload({
        abstracts: [],
        depth: 1,
        md5: 'b'.repeat(32),
        sessionId: 'source',
        sessionName: 'Design',
        url: 'http://yx.example.test/mergedMsgs.txt',
      }),
    ).toThrow('mergedMessagePayloadInvalid')
  })

  it('round-trips the UI Kit line archive and preserves original extensions', () => {
    const converter = {
      messageSerialization: vi.fn((message: V2NIMMessage) => JSON.stringify(message)),
      messageDeserialization: vi.fn((message: string) => JSON.parse(message) as V2NIMMessage),
    }
    const content = serializeYunxinMergedArchive(
      [
        {
          message: { ...rawMessage, serverExtension: '{"identity":"agent"}' },
          senderName: 'Alice',
          avatarUrl: 'https://yx.example.test/alice.png',
        },
      ],
      converter,
      { appVersion: '0.1.0', sdkVersion: '10.9.81' },
    )
    expect(JSON.parse(content.split('\n')[0]!)).toEqual({
      version: 1,
      terminal: 'web',
      sdk_version: '10.9.81',
      app_version: '0.1.0',
      message_count: 1,
    })
    const restored = deserializeYunxinMergedArchive(content, converter)
    expect(JSON.parse(restored[0]!.serverExtension!)).toEqual({
      identity: 'agent',
      mergedMessageAvatarKey: 'https://yx.example.test/alice.png',
      mergedMessageNickKey: 'Alice',
    })
    expect(yunxinMergedArchiveMd5('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('normalizes legacy numeric server ids before deserialization', () => {
    expect(normalizeYunxinMergedArchive('{"12":123}')).toBe('{"12":"123"}')
  })

  it('cancels a streaming archive as soon as it exceeds the byte limit', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(YUNXIN_MERGED_ARCHIVE_LIMIT + 1))
      },
      cancel,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream)),
    )

    await expect(
      defaultYunxinMergedArchiveLoader.load('https://yx.example.test/mergedMsgs.txt'),
    ).rejects.toThrow('mergedMessageArchiveTooLarge')
    expect(cancel).toHaveBeenCalledOnce()
  })
})
