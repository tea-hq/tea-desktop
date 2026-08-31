// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { drawerAgentProfile, fullAgentProfile } from '@/app/composerProfiles'
import type { ConversationTurn, RuntimeDescriptor } from '../contracts'
import AgentConversationComposer from './AgentConversationComposer.vue'
import AgentConversationHeader from './AgentConversationHeader.vue'
import AgentConversationSurface from './AgentConversationSurface.vue'
import AgentConversationThread from './AgentConversationThread.vue'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt', 'history'],
  status: 'ready',
}

function mountSurface(
  profile = fullAgentProfile,
  overrides: {
    turns?: ConversationTurn[]
    loading?: boolean
    streaming?: boolean
    error?: string | null
  } = {},
) {
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
      ...overrides,
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

  it('centers the full workspace composer while an idle conversation is empty', () => {
    const wrapper = mountSurface()

    expect(wrapper.classes()).toContain('agent-conversation-surface--empty')
    expect(wrapper.getComponent(AgentConversationComposer).props('centered')).toBe(true)
    expect(wrapper.findComponent(AgentConversationThread).exists()).toBe(false)
  })

  it('keeps the drawer composer in the standard thread layout', () => {
    const wrapper = mountSurface(drawerAgentProfile)

    expect(wrapper.classes()).not.toContain('agent-conversation-surface--empty')
    expect(wrapper.getComponent(AgentConversationComposer).props('centered')).toBe(false)
    expect(wrapper.findComponent(AgentConversationThread).exists()).toBe(true)
  })

  it('returns to the thread layout when the first response starts or fails', () => {
    const streaming = mountSurface(fullAgentProfile, { streaming: true })
    const failed = mountSurface(fullAgentProfile, { error: 'Runtime unavailable' })

    expect(streaming.classes()).not.toContain('agent-conversation-surface--empty')
    expect(streaming.findComponent(AgentConversationThread).exists()).toBe(true)
    expect(failed.classes()).not.toContain('agent-conversation-surface--empty')
    expect(failed.findComponent(AgentConversationThread).exists()).toBe(true)
  })

  it('forwards composer state and intents without owning them', async () => {
    const wrapper = mountSurface()
    const composer = wrapper.getComponent(AgentConversationComposer)

    expect(composer.props()).toMatchObject({ text: 'Review this', runtimeId: 'external.claude' })
    composer.vm.$emit('update:text', 'Updated')
    composer.vm.$emit('send', { text: 'Updated', attachments: [] })
    composer.vm.$emit('new-project')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:text')).toEqual([['Updated']])
    expect(wrapper.emitted('send')).toEqual([[{ text: 'Updated', attachments: [] }]])
    expect(wrapper.emitted('new-project')).toHaveLength(1)
  })
})
