// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { TaskNotification } from '../taskNotification'
import TaskNotificationFold from './TaskNotificationFold.vue'

const notification: TaskNotification = {
  taskId: 'task-1',
  toolUseId: 'call-1',
  outputFile: '/tmp/task-1.output',
  status: 'completed',
  summary: 'Background command "npm test" completed',
  resultText: 'Tests passed.',
}

function mountFold(value = notification) {
  return mount(TaskNotificationFold, {
    props: { notification: value },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('TaskNotificationFold', () => {
  it('shows a localized collapsed summary and keeps payload details hidden', () => {
    const wrapper = mountFold()

    expect(wrapper.get('[data-testid="task-notification-fold"]').text()).toContain('Completed')
    expect(wrapper.text()).toContain('Background command "npm test" completed')
    expect(wrapper.text()).not.toContain('task-1')
    expect(wrapper.text()).not.toContain('Tests passed.')
  })

  it('reveals parsed fields and result when expanded', async () => {
    const wrapper = mountFold()

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('task-1')
    expect(wrapper.text()).toContain('/tmp/task-1.output')
    expect(wrapper.text()).toContain('Tests passed.')
  })
})
