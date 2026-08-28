// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import { drawerAgentProfile } from '@/app/composerProfiles'
import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import en from '@/locales/en'
import AgentConversationSurface from '@/features/conversation/components/AgentConversationSurface.vue'
import AgentSessionDetail from './AgentSessionDetail.vue'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt'],
  status: 'ready',
}

function mountDetail() {
  return shallowMount(AgentSessionDetail, {
    props: {
      channelName: 'Product',
      title: 'Plan',
      turns: [],
      collaboration: { turnContexts: [], drafts: [], deliveries: [] },
      text: '',
      attachments: [],
      sources: [],
      runtimes: [runtime],
      runtimeId: runtime.id,
      modelOptions: [{ value: 'default' }],
      model: 'default',
      permissionMode: 'default',
    },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('AgentSessionDetail', () => {
  it('renders the shared surface with the fixed drawer profile', () => {
    const surface = mountDetail().getComponent(AgentConversationSurface)
    expect(surface.props('profile')).toBe(drawerAgentProfile)
    expect(surface.props()).toMatchObject({ subtitle: 'Product', backLabel: 'Back to sessions' })
  })

  it('forwards navigation and conversation intents', async () => {
    const wrapper = mountDetail()
    const surface = wrapper.getComponent(AgentConversationSurface)
    surface.vm.$emit('back')
    surface.vm.$emit('expand')
    surface.vm.$emit('send', { text: 'Ship it', attachments: [] })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('expand')).toHaveLength(1)
    expect(wrapper.emitted('send')).toEqual([[{ text: 'Ship it', attachments: [] }]])
  })
})
