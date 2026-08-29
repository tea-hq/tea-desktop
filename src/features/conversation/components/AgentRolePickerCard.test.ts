// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { AgentRoleOption } from '../contracts'
import AgentRolePickerCard from './AgentRolePickerCard.vue'

const roles: AgentRoleOption[] = Array.from({ length: 5 }, (_, index) => ({
  id: `role-${index + 1}`,
  name: `Role ${index + 1}`,
  description: `Description ${index + 1}`,
  prompt: `Prompt ${index + 1}`,
  skills: [`skill-${index + 1}`],
  revision: 1,
  runtimeId: 'external.claude',
}))

function mountCard(overrides: Record<string, unknown> = {}) {
  return mount(AgentRolePickerCard, {
    props: {
      roles,
      runtimeId: 'external.claude',
      roleId: null,
      ...overrides,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('AgentRolePickerCard', () => {
  it('collapses a long role list and expands on demand', async () => {
    const wrapper = mountCard()

    expect(wrapper.findAll('.role-picker__option')).toHaveLength(3)
    expect(wrapper.get('.role-picker__toggle').text()).toContain('Show 2 more')

    await wrapper.get('.role-picker__toggle').trigger('click')
    expect(wrapper.findAll('.role-picker__option')).toHaveLength(5)
    expect(wrapper.get('.role-picker__toggle').text()).toContain('Show fewer')
  })

  it('keeps the selected role visible while collapsed and forwards prompt injection', async () => {
    const wrapper = mountCard({ roleId: 'role-5' })

    expect(wrapper.findAll('.role-picker__option')).toHaveLength(3)
    expect(wrapper.get('[aria-pressed="true"]').text()).toContain('Role 5')

    await wrapper.get('.role-picker__prompt-action').trigger('click')
    expect(wrapper.emitted('applyPrompt')).toEqual([['Prompt 5']])
  })
})
