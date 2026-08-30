// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { drawerAgentProfile, fullAgentProfile } from '@/app/composerProfiles'
import type { RuntimeDescriptor } from '../contracts'
import AgentConversationComposer from './AgentConversationComposer.vue'
import AgentConversationHeader from './AgentConversationHeader.vue'
import AgentConversationSurface from './AgentConversationSurface.vue'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt', 'history'],
  status: 'ready',
}

function mountSurface(profile = fullAgentProfile) {
  return shallowMount(AgentConversationSurface, {
    props: {
      profile,
      title: 'Session',
      runtimeLabel: 'Claude Code',
      turns: [],
      text: 'Review this',
      attachments: [],
      runtimes: [runtime],
      runtimeId: runtime.id,
      modelOptions: [{ value: 'default' }],
      model: 'default',
      permissionMode: 'default',
    },
  })
}

describe('AgentConversationSurface', () => {
  it('uses the profile to control header runtime presentation', () => {
    expect(
      mountSurface(fullAgentProfile).getComponent(AgentConversationHeader).props('runtimeLabel'),
    ).toBe('Claude Code')
    expect(
      mountSurface(drawerAgentProfile).getComponent(AgentConversationHeader).props('runtimeLabel'),
    ).toBe('Claude Code')
  })

  it('forwards composer state and intents without owning them', async () => {
    const wrapper = mountSurface()
    const composer = wrapper.getComponent(AgentConversationComposer)

    expect(composer.props()).toMatchObject({ text: 'Review this', runtimeId: 'external.claude' })
    composer.vm.$emit('update:text', 'Updated')
    composer.vm.$emit('send', { text: 'Updated', attachments: [] })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:text')).toEqual([['Updated']])
    expect(wrapper.emitted('send')).toEqual([[{ text: 'Updated', attachments: [] }]])
  })
})
