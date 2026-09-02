// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkspaceSearchField from './WorkspaceSearchField.vue'

describe('WorkspaceSearchField', () => {
  it('fills its centered toolbar slot and emits search updates', async () => {
    const wrapper = mount(WorkspaceSearchField, {
      props: {
        modelValue: '',
        label: 'Search workspace',
        statusLabel: 'Connected',
        statusClass: 'bg-success',
      },
    })

    expect(wrapper.classes()).toContain('w-full')
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Connected')

    await wrapper.get('input').setValue('agent')

    expect(wrapper.emitted('update:modelValue')).toEqual([['agent']])
  })
})
