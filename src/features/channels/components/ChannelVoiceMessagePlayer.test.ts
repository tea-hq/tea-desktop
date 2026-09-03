// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ChannelVoicePlaybackState } from '../contracts'
import ChannelVoiceMessagePlayer from './ChannelVoiceMessagePlayer.vue'

const messageRef = { channelRef: 'product', messageClientId: 'voice-1' }

function playback(overrides: Partial<ChannelVoicePlaybackState> = {}): ChannelVoicePlaybackState {
  return {
    messageRef,
    status: 'paused',
    positionMs: 3_000,
    durationMs: 18_000,
    playbackRate: 1,
    retryable: false,
    ...overrides,
  }
}

function mountPlayer(extraProps: Record<string, unknown> = {}) {
  return mount(ChannelVoiceMessagePlayer, {
    props: {
      playback: null,
      durationMs: 18_000,
      playbackRate: 1,
      interactive: true,
      ...extraProps,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('ChannelVoiceMessagePlayer', () => {
  it('renders an idle control and emits seek, speed, and play intent', async () => {
    const wrapper = mountPlayer()
    expect(wrapper.get('[data-voice-player]').text()).toContain('0:00 / 0:18')

    await wrapper.get('button[aria-label="Play audio"]').trigger('click')
    await wrapper.get('input[aria-label="Audio position"]').setValue(9_000)
    await wrapper.get('[role="combobox"][aria-label="Playback speed"]').trigger('click')
    await wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text() === '1.5x')!
      .trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([[]])
    expect(wrapper.emitted('seek')).toEqual([[9_000]])
    expect(wrapper.emitted('rate')).toEqual([[1.5]])
  })

  it('renders stable loading, playing, paused, and failure commands', async () => {
    const wrapper = mountPlayer({ playback: playback({ status: 'loading' }) })
    expect(wrapper.get('[role="status"]').text()).toContain('Loading audio')
    await wrapper.get('button[aria-label="Cancel loading audio"]').trigger('click')

    await wrapper.setProps({ playback: playback({ status: 'playing', positionMs: 6_000 }) })
    expect(wrapper.get('[data-voice-player]').text()).toContain('0:06 / 0:18')
    await wrapper.get('button[aria-label="Pause audio"]').trigger('click')

    await wrapper.setProps({ playback: playback({ status: 'paused' }) })
    expect(wrapper.get('button[aria-label="Play audio"]').attributes('disabled')).toBeUndefined()

    await wrapper.setProps({
      playback: playback({
        status: 'failed',
        errorCode: 'network',
        retryable: true,
      }),
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('network')
    await wrapper.get('button[aria-label="Retry audio playback"]').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([[], []])
    expect(wrapper.emitted('retry')).toEqual([[]])
  })

  it('disables playback and seeking outside an interactive message', () => {
    const wrapper = mountPlayer({ interactive: false, playback: playback() })
    expect(wrapper.get('button[aria-label="Play audio"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input[aria-label="Audio position"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="combobox"]').attributes('disabled')).toBeDefined()
  })
})
