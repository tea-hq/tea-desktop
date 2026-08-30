// @vitest-environment happy-dom

import { mount, type MountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'

import TeaButton from '../TeaButton.vue'
import TeaDialog from '../TeaDialog.vue'
import TeaDrawer from '../TeaDrawer.vue'
import TeaEmptyState from '../TeaEmptyState.vue'
import TeaIconButton from '../TeaIconButton.vue'
import TeaIconMenu from '../TeaIconMenu.vue'
import TeaInput from '../TeaInput.vue'
import TeaMenu from '../TeaMenu.vue'
import TeaMenuSelect from '../TeaMenuSelect.vue'
import TeaSelect from '../TeaSelect.vue'
import TeaTabs from '../TeaTabs.vue'
import TeaTextarea from '../TeaTextarea.vue'

function mountTea(component: Component, options: MountingOptions<never> = {}) {
  return mount(component, {
    ...options,
    global: options.global,
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

  it('grows auto-sizing textareas with content and shrinks after controlled updates', async () => {
    const wrapper = mountTea(TeaTextarea, {
      props: { modelValue: 'One line', label: 'Message', rows: 1, autoGrow: true },
    })
    const textarea = wrapper.get('textarea')
    let scrollHeight = 72
    Object.defineProperty(textarea.element, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    await textarea.setValue('One line\nTwo lines\nThree lines')
    expect((textarea.element as HTMLTextAreaElement).style.height).toBe('72px')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      'One line\nTwo lines\nThree lines',
    ])

    scrollHeight = 28
    await wrapper.setProps({ modelValue: '' })
    expect((textarea.element as HTMLTextAreaElement).style.height).toBe('28px')
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
        options: [
          { value: 'tea', label: 'Tea' },
          { value: 'codex', label: 'Codex' },
        ],
      },
    })

    await wrapper.get('select').setValue('codex')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([['codex']])
  })

  it('uses an application menu instead of the native select popup', async () => {
    const wrapper = mountTea(TeaMenuSelect, {
      props: {
        modelValue: 'tea',
        label: 'Runtime',
        options: [
          { value: 'tea', label: 'Tea' },
          { value: 'codex', label: 'Codex' },
        ],
      },
    })

    await wrapper.get('[role="combobox"]').trigger('click')
    expect(wrapper.get('[role="menu"]')).toBeTruthy()
    await wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text() === 'Codex')!
      .trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['codex']])
  })

  it('places requested popup menus above their trigger and clamps them to the viewport', async () => {
    const wrapper = mountTea(TeaMenuSelect, {
      props: {
        modelValue: 'tea',
        label: 'Permission mode',
        menuPlacement: 'up',
        options: [
          { value: 'tea', label: 'Ask for approval' },
          { value: 'codex', label: 'Full access' },
        ],
      },
    })
    const trigger = wrapper.get('[role="combobox"]').element as HTMLElement
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 480,
        right: 280,
        bottom: 512,
        left: 180,
        width: 100,
        height: 32,
        x: 180,
        y: 480,
        toJSON: () => {},
      }),
    })

    await wrapper.get('[role="combobox"]').trigger('click')
    const menu = wrapper.get('[role="menu"]').element as HTMLElement
    Object.defineProperty(menu, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        right: 208,
        bottom: 100,
        left: 0,
        width: 208,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    })

    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(Number.parseFloat(menu.style.top)).toBe(376)
    expect(Number.parseFloat(menu.style.left)).toBe(180)
    wrapper.unmount()
  })

  it('allows an open icon menu to close from its own trigger', async () => {
    const wrapper = mountTea(TeaIconMenu, {
      props: {
        label: 'Choose Agent',
        items: [{ value: 'codex', label: 'Codex' }],
      },
    })
    const trigger = wrapper.get('button')

    await trigger.trigger('click')
    expect(wrapper.get('[role="menu"]')).toBeTruthy()
    await trigger.trigger('pointerdown')
    await trigger.trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits semantic menu commands', async () => {
    const wrapper = mountTea(TeaMenu, {
      props: { label: 'Actions', items: [{ value: 'edit', label: 'Edit' }] },
    })

    await wrapper.get('[role="menuitem"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['edit']])
  })

  it('maps overlay dismissal to one close intent', async () => {
    const dialog = mountTea(TeaDialog, { props: { open: true, title: 'Edit draft' } })
    const dialogClose = document.body.querySelector('[role="dialog"] button')
    expect(dialogClose).not.toBeNull()
    dialogClose!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await dialog.vm.$nextTick()
    expect(dialog.emitted('close')).toHaveLength(1)
    dialog.unmount()

    const drawer = mountTea(TeaDrawer, { props: { open: true, title: 'Agent' } })
    const drawerClose = document.body.querySelector('[role="dialog"] button')
    expect(drawerClose).not.toBeNull()
    drawerClose!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await drawer.vm.$nextTick()
    expect(drawer.emitted('close')).toHaveLength(1)
  })

  it('supports a quiet drawer surface without changing the default treatment', () => {
    const defaultWrapper = mountTea(TeaDrawer, {
      props: { open: true, title: 'Agent' },
    })
    const defaultDialog = Array.from(document.body.querySelectorAll('[role="dialog"]')).at(-1)!
    const defaultHeader = defaultDialog.querySelector('header')!
    expect(defaultDialog.className).toContain('border-l')
    expect(defaultHeader.className).toContain('border-b')
    defaultWrapper.unmount()

    const wrapper = mountTea(TeaDrawer, {
      props: { open: true, title: 'Agent', appearance: 'quiet' },
    })
    const dialog = Array.from(document.body.querySelectorAll('[role="dialog"]')).at(-1)!
    const header = dialog.querySelector('header')!

    expect(dialog.className).toContain('border-l-0')
    expect(header.className).toContain('bg-raised')
    expect(header.className).not.toContain('border-b')
    wrapper.unmount()
  })

  it('renders tabs with keyboard semantics and controlled selection', async () => {
    const wrapper = mountTea(TeaTabs, {
      props: {
        modelValue: 'recent',
        label: 'Conversation views',
        tabs: [
          { value: 'recent', label: 'Recent' },
          { value: 'all', label: 'All' },
        ],
      },
      slots: { recent: 'Recent conversations', all: 'All conversations' },
    })

    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Conversation views')
    await wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === 'All')!
      .trigger('click')
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
