import { describe, expect, it } from 'vitest'
import {
  createTextMessageContent,
  messageContentToText,
  redactMessageContent,
} from './messageContent'

describe('message content projections', () => {
  it('keeps text content lossless for the existing timeline projection', () => {
    const content = createTextMessageContent('hello')
    expect(content).toEqual({ kind: 'text', text: 'hello' })
    expect(messageContentToText(content)).toBe('hello')
  })

  it('creates safe summaries for structured and media content', () => {
    expect(
      messageContentToText({
        kind: 'image',
        media: { name: 'design.png', url: 'https://example.test/design.png' },
      }),
    ).toBe('[image: design.png]')
    expect(
      messageContentToText({
        kind: 'location',
        latitude: 1,
        longitude: 2,
        address: 'Office',
      }),
    ).toBe('[location: Office]')
    expect(messageContentToText({ kind: 'notification', notificationType: 1, targetIds: [] })).toBe(
      '[notification]',
    )
  })

  it('redacts all content when a message is revoked', () => {
    expect(messageContentToText(redactMessageContent())).toBe('')
  })
})
