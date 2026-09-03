// @vitest-environment happy-dom

import { mount, type MountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'

import TeaButton from '../TeaButton.vue'
import TeaChoiceButton from '../TeaChoiceButton.vue'
import TeaCheckbox from '../TeaCheckbox.vue'
import TeaDialog from '../TeaDialog.vue'
import TeaDrawer from '../TeaDrawer.vue'
import TeaEmptyState from '../TeaEmptyState.vue'
import TeaIconButton from '../TeaIconButton.vue'
import TeaIconMenu from '../TeaIconMenu.vue'
import TeaInput from '../TeaInput.vue'
import TeaMenu from '../TeaMenu.vue'
import TeaMenuSelect from '../TeaMenuSelect.vue'
import TeaSelect from '../TeaSelect.vue'
import TeaSlider from '../TeaSlider.vue'
import TeaTabs from '../TeaTabs.vue'
import TeaTextarea from '../TeaTextarea.vue'
import TeaToggle from '../TeaToggle.vue'

function mountTea(component: Component, options: MountingOptions<never> = {}) {
  return mount(component, {
    ...options,
    global: options.global,
  })
}

describe('Tea primitives', () => {
  it('keeps checkboxes controlled with accessible and disabled states', async () => {
    const wrapper = mountTea(TeaCheckbox, {
      props: { modelValue: false, label: 'Select Product' },
    })
    const input = wrapper.get<HTMLInputElement>('input[type="checkbox"]')

    expect(input.attributes('aria-label')).toBe('Select Product')
    await input.setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(input.element.checked).toBe(true)

    await wrapper.setProps({ disabled: true })
    expect(input.attributes('disabled')).toBeDefined()
  })

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
      attachTo: document.body,
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

    textarea.element.blur()
    ;(wrapper.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(textarea.element)
    wrapper.unmount()
  })

  it('disables loading buttons and preserves their busy state', () => {
    const wrapper = mountTea(TeaButton, {
      props: { loading: true, appearance: 'primary' },
      slots: { default: 'Send' },
    })

    expect(wrapper.get('button').attributes()).toMatchObject({ disabled: '', 'aria-busy': 'true' })
    expect(wrapper.text()).toContain('Send')
  })

  it('exposes choice semantics and emits one select intent', async () => {
    const wrapper = mountTea(TeaChoiceButton, {
      props: { selected: false, controlRole: 'checkbox' },
      slots: { default: 'Preserve source reference' },
    })
    const choice = wrapper.get('button')

    expect(choice.attributes()).toMatchObject({ role: 'checkbox', 'aria-checked': 'false' })
    await choice.trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('exposes controlled switch semantics and preserves disabled state', async () => {
    const wrapper = mountTea(TeaToggle, {
      props: { modelValue: false, label: 'Enable GitHub' },
    })
    const toggle = wrapper.get('[role="switch"]')

    expect(toggle.attributes()).toMatchObject({
      'aria-label': 'Enable GitHub',
      'aria-checked': 'false',
    })
    await toggle.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])

    await wrapper.setProps({ modelValue: true, disabled: true })
    expect(toggle.attributes()).toMatchObject({ 'aria-checked': 'true', disabled: '' })
    wrapper.unmount()
  })

  it('requires icon-button labels at the type boundary and forwards them', () => {
    const wrapper = mountTea(TeaIconButton, { props: { label: 'Close', icon: 'i-mdi-close' } })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Close')
  })

  it('keeps sliders controlled with bounded accessible values', async () => {
    const wrapper = mountTea(TeaSlider, {
      props: {
        modelValue: 25,
        min: 0,
        max: 100,
        step: 1,
        label: 'Voice position',
        valueText: '0:03 of 0:12',
      },
    })
    const input = wrapper.get<HTMLInputElement>('input[type="range"]')

    expect(input.attributes()).toMatchObject({
      'aria-label': 'Voice position',
      'aria-valuetext': '0:03 of 0:12',
      min: '0',
      max: '100',
      step: '1',
    })
    await input.setValue(50)
    expect(wrapper.emitted('update:modelValue')).toEqual([[50]])

    await wrapper.setProps({ disabled: true })
    expect(input.attributes('disabled')).toBeDefined()
  })

  it('keeps the select compatibility entry point on the application menu', async () => {
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

    expect(wrapper.find('select').exists()).toBe(false)
    await wrapper.get('[role="combobox"]').trigger('click')
    await wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text() === 'Codex')!
      .trigger('click')

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

  it('matches field menu width to its trigger', async () => {
    const wrapper = mountTea(TeaMenuSelect, {
      props: {
        modelValue: 'tea',
        label: 'Runtime',
        appearance: 'field',
        options: [{ value: 'tea', label: 'Tea' }],
      },
    })
    const trigger = wrapper.get('[role="combobox"]').element as HTMLElement
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 40,
        right: 340,
        bottom: 80,
        left: 40,
        width: 300,
        height: 40,
        x: 40,
        y: 40,
        toJSON: () => {},
      }),
    })

    await wrapper.get('[role="combobox"]').trigger('click')

    expect(wrapper.get('[role="menu"]').attributes('style')).toContain('min-width: 300px')
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

  it('supports a quiet drawer surface with a structural header rule', () => {
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
    expect(header.className).toContain('border-b')
    wrapper.unmount()
  })

  it('keeps a headerless drawer labelled for assistive technology', () => {
    const wrapper = mountTea(TeaDrawer, {
      props: { open: true, title: 'Agent collaboration', showHeader: false },
    })
    const dialog = Array.from(document.body.querySelectorAll('[role="dialog"]')).at(-1)!
    const titleId = dialog.getAttribute('aria-labelledby')!

    expect(dialog.querySelector('header')).toBeNull()
    expect(dialog.querySelector(`#${titleId}`)?.textContent).toBe('Agent collaboration')
    expect(dialog.querySelector(`#${titleId}`)?.classList).toContain('sr-only')
    wrapper.unmount()
  })

  it('resizes a drawer with pointer and keyboard controls within its bounds', async () => {
    const wrapper = mountTea(TeaDrawer, {
      props: {
        open: true,
        title: 'Agent',
        resizable: true,
        defaultWidth: 520,
        minWidth: 400,
        maxWidth: 700,
        resizeLabel: 'Resize Agent drawer',
      },
    })
    const dialog = Array.from(document.body.querySelectorAll('[role="dialog"]')).at(-1)!
    const handle = dialog.querySelector('[role="separator"]') as HTMLElement

    expect(dialog.getAttribute('style')).toContain('width: 520px')
    expect(handle.getAttribute('aria-valuenow')).toBe('520')

    await handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(dialog.getAttribute('style')).toContain('width: 536px')
    await handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(dialog.getAttribute('style')).toContain('width: 400px')
    await handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(dialog.getAttribute('style')).toContain('width: 700px')

    const pointer = (target: EventTarget, type: string, values: Record<string, number>) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: values.button ?? 0,
        clientX: values.clientX ?? 0,
      })
      target.dispatchEvent(event)
    }
    pointer(handle, 'pointerdown', { button: 0, clientX: 100, pointerId: 1 })
    pointer(window, 'pointermove', { clientX: 180 })
    await wrapper.vm.$nextTick()
    expect(dialog.getAttribute('style')).toContain('width: 620px')
    pointer(window, 'pointerup', {})
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
    expect(wrapper.get('[role="tablist"]').classes()).toContain('nav-pill-group')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').classes()).toContain(
      'nav-pill-group__item',
    )
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
