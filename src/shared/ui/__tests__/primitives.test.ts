// @vitest-environment happy-dom

import { mount, type MountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'

import { installTeaUi } from '../theme/installTeaUi'
import TeaButton from '../TeaButton.vue'
import TeaDialog from '../TeaDialog.vue'
import TeaDrawer from '../TeaDrawer.vue'
import TeaEmptyState from '../TeaEmptyState.vue'
import TeaIconButton from '../TeaIconButton.vue'
import TeaInput from '../TeaInput.vue'
import TeaMenu from '../TeaMenu.vue'
import TeaSelect from '../TeaSelect.vue'
import TeaTabs from '../TeaTabs.vue'

const teaUiPlugin = { install: installTeaUi }

function mountTea(component: Component, options: MountingOptions<never> = {}) {
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [teaUiPlugin, ...(options.global?.plugins ?? [])],
    },
  })
}

describe('Tea primitives', () => {
  it('keeps inputs controlled and forwards invalid and accessible states', async () => {
    const wrapper = mountTea(TeaInput, {
      props: { modelValue: 'before', label: 'Workspace name', invalid: true },
    })
    const input = wrapper.get('input')

    expect(input.attributes('aria-label')).toBe('Workspace name')
    expect(input.attributes('aria-invalid')).toBe('true')
    await input.setValue('after')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['after'])
  })

  it('disables loading buttons and preserves their busy state', () => {
    const wrapper = mountTea(TeaButton, {
      props: { loading: true, appearance: 'primary' },
      slots: { default: 'Send' },
    })

    expect(wrapper.get('button').attributes()).toMatchObject({ disabled: '', 'aria-busy': 'true' })
    expect(wrapper.text()).toContain('Send')
  })

  it('requires icon-button labels at the type boundary and forwards them', () => {
    const wrapper = mountTea(TeaIconButton, { props: { label: 'Close', icon: 'i-mdi-close' } })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Close')
  })

  it('emits selected values from selects', async () => {
    const wrapper = mountTea(TeaSelect, {
      props: {
        modelValue: 'tea',
        label: 'Runtime',
        options: [{ value: 'tea', label: 'Tea' }, { value: 'codex', label: 'Codex' }],
      },
    })

    wrapper.getComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'codex')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([['codex']])
  })

  it('emits semantic menu commands', async () => {
    const wrapper = mountTea(TeaMenu, {
      props: { label: 'Actions', items: [{ value: 'edit', label: 'Edit' }] },
    })

    await wrapper.get('[data-pc-section="itemcontent"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['edit']])
  })

  it('maps overlay dismissal to one close intent', async () => {
    const dialog = mountTea(TeaDialog, { props: { open: true, title: 'Edit draft' } })
    dialog.getComponent({ name: 'Dialog' }).vm.$emit('update:visible', false)
    await dialog.vm.$nextTick()
    expect(dialog.emitted('close')).toHaveLength(1)

    const drawer = mountTea(TeaDrawer, { props: { open: true, title: 'Agent' } })
    drawer.getComponent({ name: 'Drawer' }).vm.$emit('update:visible', false)
    await drawer.vm.$nextTick()
    expect(drawer.emitted('close')).toHaveLength(1)
  })

  it('renders tabs with keyboard semantics and controlled selection', async () => {
    const wrapper = mountTea(TeaTabs, {
      props: {
        modelValue: 'recent',
        label: 'Conversation views',
        tabs: [{ value: 'recent', label: 'Recent' }, { value: 'all', label: 'All' }],
      },
      slots: { recent: 'Recent conversations', all: 'All conversations' },
    })

    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Conversation views')
    wrapper.getComponent({ name: 'Tabs' }).vm.$emit('update:value', 'all')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([['all']])
  })

  it('renders an unframed semantic empty state with actions', () => {
    const wrapper = mountTea(TeaEmptyState, {
      props: { title: 'No conversations', description: 'Start one when you are ready.' },
      slots: { actions: '<button>Create</button>' },
    })

    expect(wrapper.get('[role="status"]').text()).toContain('No conversations')
    expect(wrapper.text()).toContain('Create')
  })
})
