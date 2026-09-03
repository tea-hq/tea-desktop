// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ChannelMediaSaveState, Message } from '../contracts'
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
    media: {
      url: 'https://media.example.test/release-update.aac',
      name: 'release-update.aac',
      durationMs: 2_400,
    },
  },
}

const imageMessage: Message = {
  ...message,
  ref: { channelRef: 'channel-product', messageClientId: 'message-image' },
  text: '[image: release-plan.png]',
  content: {
    kind: 'image',
    caption: 'Release plan',
    media: {
      url: 'https://media.example.test/release-plan.png',
      name: 'release-plan.png',
      size: 2_048,
      width: 1_200,
      height: 800,
    },
  },
}

const reactedMessage: Message = {
  ...message,
  ref: { channelRef: 'channel-product', messageClientId: 'message-reacted' },
  reactions: [{ type: 1, count: 2, active: true }],
}

function mediaSaveState(overrides: Partial<ChannelMediaSaveState> = {}): ChannelMediaSaveState {
  return {
    operationId: 'media-save-1',
    messageRef: imageMessage.ref,
    status: 'saving',
    receivedBytes: 1_024,
    totalBytes: 2_048,
    retryable: false,
    ...overrides,
  }
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

  it('opens the quick comment picker from the overflow menu when there are no reactions', async () => {
    const wrapper = mountMessage(message)

    await wrapper.get('button[aria-label="More message actions"]').trigger('click')
    await wrapper.get('[role="menuitem"]').trigger('click')

    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Quick reaction')
    expect(wrapper.findAll('[data-quick-comment-type]').length).toBe(70)

    await wrapper.get('[data-quick-comment-type="45"]').trigger('click')
    expect(wrapper.emitted('quickComment')).toEqual([[45, true]])
  })

  it('renders reaction assets with an inline add entry and toggles active reactions', async () => {
    const wrapper = mountMessage(reactedMessage)

    const chip = wrapper.get('button[aria-label="Remove Laugh reaction"]')
    expect(chip.find('img').attributes('src')).toContain('icon-a-1')
    await chip.trigger('click')
    expect(wrapper.emitted('quickComment')).toEqual([[1, false]])

    await wrapper.get('button[aria-label="Add a reaction"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.get('button[aria-label="Add a reaction"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('uses the Tea player and forwards typed voice playback intent', async () => {
    const wrapper = mountMessage(voiceMessage, {
      voicePlaybackAvailable: true,
      voicePlaybackRate: 1,
      voicePlayback: {
        messageRef: voiceMessage.ref,
        status: 'paused',
        positionMs: 1_000,
        durationMs: 2_400,
        playbackRate: 1,
        retryable: false,
      },
    })

    expect(wrapper.find('audio').exists()).toBe(false)
    await wrapper.get('button[aria-label="Play audio"]').trigger('click')
    await wrapper.get('input[aria-label="Audio position"]').setValue(1_500)

    expect(wrapper.emitted('toggleVoicePlayback')).toEqual([[]])
    expect(wrapper.emitted('seekVoicePlayback')).toEqual([[1_500]])
  })

  it('opens compact visual media and routes provider-neutral save intent', async () => {
    const wrapper = mountMessage(imageMessage, {
      mediaSavingAvailable: true,
      mediaSave: mediaSaveState({ status: 'saved', fileName: 'release-plan.png' }),
    })

    expect(wrapper.get('[data-media-preview]').element.tagName).toBe('BUTTON')
    expect(wrapper.get('[data-media-preview]').attributes('aria-label')).toBe('Open image preview')
    expect(wrapper.text()).toContain('release-plan.png')
    expect(wrapper.text()).toContain('2.0 KB')

    await wrapper.get('[data-media-preview]').trigger('click')
    await wrapper.get('button[aria-label="Save attachment again"]').trigger('click')

    expect(wrapper.emitted('openMedia')).toEqual([[]])
    expect(wrapper.emitted('saveMedia')).toEqual([[]])
  })

  it('removes inline video controls and direct file links', () => {
    const video = mountMessage({
      ...imageMessage,
      ref: { channelRef: 'channel-product', messageClientId: 'message-video' },
      content: {
        kind: 'video',
        media: { url: 'https://media.example.test/demo.mp4', name: 'demo.mp4' },
      },
    })
    expect(video.find('video').exists()).toBe(true)
    expect(video.get('video').attributes('controls')).toBeUndefined()
    expect(video.get('[data-media-preview]').attributes('aria-label')).toBe('Open video preview')

    const file = mountMessage({
      ...imageMessage,
      ref: { channelRef: 'channel-product', messageClientId: 'message-file' },
      content: {
        kind: 'file',
        media: { url: 'https://media.example.test/plan.pdf', name: 'plan.pdf' },
      },
    })
    expect(file.find('a').exists()).toBe(false)
    expect(file.text()).toContain('plan.pdf')
  })

  it('disables media actions while selecting messages', () => {
    const wrapper = mountMessage(imageMessage, {
      selectionMode: true,
      mediaSavingAvailable: true,
    })

    expect(wrapper.get('[data-media-preview]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-media-save-control] button').attributes('disabled')).toBeDefined()
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
