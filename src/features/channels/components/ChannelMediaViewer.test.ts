// @vitest-environment happy-dom

import { DOMWrapper, enableAutoUnmount, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Message } from '../contracts'
import ChannelMediaViewer from './ChannelMediaViewer.vue'

const imageMessage: Message = {
  ref: { channelRef: 'product', messageClientId: 'image-1' },
  sender: { id: 'lin', name: 'Lin', isCurrentUser: false },
  sentAt: 1,
  text: '[image: release-plan.png]',
  content: {
    kind: 'image',
    media: {
      url: 'https://media.example.test/release-plan.png',
      name: 'release-plan.png',
      size: 2_048,
    },
  },
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}

function mountViewer(message: Message = imageMessage) {
  return mount(ChannelMediaViewer, {
    attachTo: document.body,
    props: {
      open: true,
      message,
      canGoPrevious: true,
      canGoNext: true,
      savingAvailable: true,
    },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})
enableAutoUnmount(afterEach)

function getTeleportedElement(selector: string): DOMWrapper<Element> {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`Unable to get ${selector} from the teleported media viewer`)
  return new DOMWrapper(element)
}

describe('ChannelMediaViewer', () => {
  it('renders an accessible image viewer and emits navigation and save intent', async () => {
    const wrapper = mountViewer()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'release-plan.png preview',
    )
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading media')

    await getTeleportedElement('img').trigger('load')
    await getTeleportedElement('button[aria-label="Previous media"]').trigger('click')
    await getTeleportedElement('button[aria-label="Next media"]').trigger('click')
    await getTeleportedElement('button[aria-label="Save attachment"]').trigger('click')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(wrapper.emitted('previous')).toHaveLength(2)
    expect(wrapper.emitted('next')).toEqual([[]])
    expect(wrapper.emitted('save')).toEqual([[]])
  })

  it('uses native video playback only inside the viewer and retries load failures', async () => {
    const videoMessage: Message = {
      ...imageMessage,
      ref: { channelRef: 'product', messageClientId: 'video-1' },
      text: '[video: demo.mp4]',
      content: {
        kind: 'video',
        media: { url: 'https://media.example.test/demo.mp4', name: 'demo.mp4' },
      },
    }
    mountViewer(videoMessage)
    const video = getTeleportedElement('video')
    expect(video.attributes('controls')).toBeDefined()

    await video.trigger('error')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load this media',
    )
    const retryButton = getTeleportedElement('[role="alert"] button')
    expect(retryButton.text()).toContain('Retry media loading')
    await retryButton.trigger('click')
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading media')
  })
})
