// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WindowChrome from './WindowChrome.vue'

describe('WindowChrome', () => {
  it('shares the native 48px window chrome height', () => {
    const wrapper = mount(WindowChrome)

    expect(wrapper.attributes('style')).toContain('--window-chrome-height: 48px')
  })
})
