// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { OutgoingMessageAttempt } from '../contracts'
import ChannelOutgoingMessageItem from './ChannelOutgoingMessageItem.vue'

function attempt(overrides: Partial<OutgoingMessageAttempt> = {}): OutgoingMessageAttempt {
  return {
    attemptId: 'attempt-1',
    idempotencyKey: 'im-send:v1:one',
    operationId: 'operation-1',
    channelRef: 'channel-1',
    content: { kind: 'text', text: 'Review this' },
    mentions: [],
    createdAt: 1,
    status: 'sending',
    progress: 0,
    attemptNumber: 1,
    retryable: false,
    ...overrides,
  }
}

function mountItem(value: OutgoingMessageAttempt) {
  return mount(ChannelOutgoingMessageItem, {
    props: { attempt: value },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('ChannelOutgoingMessageItem', () => {
  it('renders upload progress and emits accessible cancellation intent', async () => {
    const wrapper = mountItem(
      attempt({
        content: {
          kind: 'image',
          caption: 'Updated mockup',
          media: {
            source: { kind: 'localFile', token: 'file-token' },
            name: 'tea-desktop-agent-collaboration-review-final.png',
          },
        },
        progress: 64,
      }),
    )

    expect(wrapper.text()).toContain('Sending · 64%')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('64')
    expect(wrapper.get('.max-w-64').classes()).toContain('truncate')

    await wrapper.get('button[aria-label="Cancel send"]').trigger('click')
    expect(wrapper.emitted('cancel')).toEqual([[]])
  })

  it('renders a retryable failure and emits retry and dismiss intents', async () => {
    const wrapper = mountItem(
      attempt({ status: 'failed', retryable: true, errorCode: 'transport' }),
    )

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not send (transport)')
    await wrapper.get('button[aria-label="Retry send"]').trigger('click')
    await wrapper.get('button[aria-label="Dismiss unsent message"]').trigger('click')

    expect(wrapper.emitted('retry')).toEqual([[]])
    expect(wrapper.emitted('dismiss')).toEqual([[]])
  })

  it('does not offer retry for a non-retryable failure', () => {
    const wrapper = mountItem(
      attempt({ status: 'failed', retryable: false, errorCode: 'invalidRequest' }),
    )

    expect(wrapper.find('button[aria-label="Retry send"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Dismiss unsent message"]').exists()).toBe(true)
  })

  it('keeps cancelled content available for retry', () => {
    const wrapper = mountItem(attempt({ status: 'cancelled', retryable: true }))

    expect(wrapper.text()).toContain('Send cancelled')
    expect(wrapper.find('button[aria-label="Retry send"]').exists()).toBe(true)
  })
})
