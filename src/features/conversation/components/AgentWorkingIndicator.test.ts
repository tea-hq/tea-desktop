// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AgentWorkingIndicator from './AgentWorkingIndicator.vue'

describe('AgentWorkingIndicator', () => {
  it('announces the current work with breathing and progress styles', () => {
    const wrapper = mount(AgentWorkingIndicator, { props: { label: 'Running read…' } })

    expect(wrapper.get('[role="status"]').text()).toBe('Running read…')
    expect(wrapper.get('.agent-working-indicator__label').classes()).toContain('animate-pulse')
    expect(wrapper.get('.agent-working-indicator__icon').classes()).toContain('animate-spin')
  })
})
