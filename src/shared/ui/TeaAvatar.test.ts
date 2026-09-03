// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TeaAvatar from './TeaAvatar.vue'

describe('TeaAvatar', () => {
  it('uses the generated avatar after a missing primary source', () => {
    const generatedSource = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'
    const wrapper = mount(TeaAvatar, {
      props: {
        src: '',
        fallbackSrc: generatedSource,
        fallbackText: 'AB',
      },
    })

    expect(wrapper.get('img').attributes('src')).toBe(generatedSource)
  })

  it('falls back to text after both image sources fail', async () => {
    const generatedSource = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'
    const wrapper = mount(TeaAvatar, {
      props: {
        src: 'https://example.test/avatar.svg',
        fallbackSrc: generatedSource,
        fallbackText: 'AB',
      },
    })

    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(generatedSource)

    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('AB')
  })

  it('resets failed sources when the avatar source changes', async () => {
    const wrapper = mount(TeaAvatar, {
      props: {
        src: 'https://example.test/old.svg',
        fallbackText: 'AB',
      },
    })

    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)

    await wrapper.setProps({ src: 'https://example.test/new.svg' })
    expect(wrapper.get('img').attributes('src')).toBe('https://example.test/new.svg')
  })

  it.each([
    ['small', 'size-7'],
    ['default', 'size-8'],
    ['medium', 'size-10'],
    ['large', 'size-16'],
    ['fill', 'size-full'],
  ] as const)('applies the %s size preset', (size, expectedClass) => {
    const wrapper = mount(TeaAvatar, {
      props: { size, fallbackText: 'AB' },
    })

    expect(wrapper.classes()).toContain(expectedClass)
  })
})
