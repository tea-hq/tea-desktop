// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import DraftEditorDialog from './DraftEditorDialog.vue'

const draft = {
  draftId: 'draft-1', conversationId: 'conversation-1', sourceTurnIndex: 0,
  sourceBlockId: 'block-1', currentVersion: 1, content: 'Initial draft', createdAt: 1, updatedAt: 1,
}

function mountDialog() {
  return mount(DraftEditorDialog, {
    props: { open: true, draft },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      stubs: {
        TeaDialog: defineComponent({ name: 'TeaDialog', emits: ['close'], template: '<div><slot /></div>' }),
        DraftEditor: defineComponent({ name: 'DraftEditor', emits: ['save', 'deliver'], template: '<div />' }),
      },
    },
  })
}

describe('DraftEditorDialog', () => {
  it('maps close, save, and delivery to explicit intents', async () => {
    const wrapper = mountDialog()
    wrapper.getComponent({ name: 'TeaDialog' }).vm.$emit('close')
    wrapper.getComponent({ name: 'DraftEditor' }).vm.$emit('save', 'Updated draft')
    wrapper.getComponent({ name: 'DraftEditor' }).vm.$emit('deliver')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('save')).toEqual([['Updated draft']])
    expect(wrapper.emitted('deliver')).toHaveLength(1)
  })

  it('does not render an editor without a selected draft', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ draft: null })
    expect(wrapper.findComponent({ name: 'DraftEditor' }).exists()).toBe(false)
  })
})
