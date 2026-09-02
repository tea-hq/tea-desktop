// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Message } from '../contracts'
import ChannelMessageItem from './ChannelMessageItem.vue'

const message: Message = {
  ref: { channelRef: 'channel-product', messageClientId: 'message-merged' },
  sender: { id: 'sender', name: 'Lin', isCurrentUser: false },
  sentAt: 1,
  text: 'Product history',
  content: {
    kind: 'merged',
    sourceChannelName: 'Product',
    abstracts: [
      {
        senderAccountId: 'sender',
        senderName: 'Lin',
        text: 'A long summary that must shrink inside a narrow timeline.',
      },
    ],
    depth: 1,
  },
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}

const voiceMessage: Message = {
  ...message,
  ref: { channelRef: 'channel-product', messageClientId: 'message-voice' },
  text: '[audio: release-update.aac]',
  content: {
    kind: 'audio',
    caption: 'Release update',
    media: { name: 'release-update.aac', durationMs: 2_400 },
  },
}

function mountMessage(messageValue: Message, extraProps: Record<string, unknown> = {}) {
  return mount(ChannelMessageItem, {
    props: {
      message: messageValue,
      menuOpenUp: false,
      activeConversation: null,
      recentConversations: [],
      currentSessionAvailable: false,
      runtimes: [],
      defaultRuntimeId: null,
      ...extraProps,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('ChannelMessageItem', () => {
  it('allows merged message rows to shrink within narrow timelines', () => {
    const wrapper = mountMessage(message)

    expect(wrapper.get('.channel-message > div').classes()).toContain('min-w-0')
    expect(wrapper.get('.channel-message > div > div > .mt-1').classes()).toContain('max-w-full')
    expect(wrapper.get('[aria-label="Open chat history from Product"]').classes()).toContain(
      'max-w-full',
    )
  })

  it('offers a compact transcription command only for eligible voice messages', async () => {
    const wrapper = mountMessage(voiceMessage, { voiceTranscriptionAvailable: true })
    const action = wrapper.get('button[aria-label="Transcribe audio"]')

    await action.trigger('click')

    expect(wrapper.emitted('transcribeVoice')).toEqual([[]])
    expect(wrapper.text()).toContain('Release update')

    await wrapper.setProps({ message: { ...voiceMessage, state: 'revoked' } })
    expect(wrapper.find('button[aria-label="Transcribe audio"]').exists()).toBe(false)
  })

  it('renders bounded loading, ready, and retryable transcription states inline', async () => {
    const wrapper = mountMessage(voiceMessage, {
      voiceTranscriptionAvailable: true,
      voiceTranscript: {
        messageRef: voiceMessage.ref,
        status: 'loading',
        retryable: false,
      },
    })

    expect(wrapper.get('[role="status"]').text()).toContain('Transcribing audio')

    await wrapper.setProps({
      voiceTranscript: {
        messageRef: voiceMessage.ref,
        status: 'ready',
        text: 'Review the release plan before 4 PM.',
        retryable: false,
      },
    })
    expect(wrapper.get('[data-voice-transcript]').text()).toContain('Transcript')
    expect(wrapper.get('[data-voice-transcript]').text()).toContain(
      'Review the release plan before 4 PM.',
    )

    await wrapper.setProps({
      voiceTranscript: {
        messageRef: voiceMessage.ref,
        status: 'failed',
        errorCode: 'transport',
        retryable: true,
      },
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('transport')
    await wrapper.get('button[aria-label="Retry transcription"]').trigger('click')
    expect(wrapper.emitted('transcribeVoice')).toEqual([[]])
  })
})
