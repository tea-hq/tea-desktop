// @vitest-environment happy-dom

import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import TaskWorkspace from './TaskWorkspace.vue'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function mountWorkspace(locale: 'en' | 'zh-CN' = 'en', searchQuery = ''): VueWrapper {
  const i18n = createI18n({ legacy: false, locale, messages: { en, 'zh-CN': zhCN } })
  wrapper = mount(TaskWorkspace, {
    props: { searchQuery },
    attachTo: document.body,
    global: { plugins: [i18n] },
  })
  return wrapper
}

describe('TaskWorkspace', () => {
  it('projects one task collection into list and board views', async () => {
    const page = mountWorkspace()

    expect(page.findAll('[data-testid="task-list-row"]')).toHaveLength(8)
    await page.get('button[aria-label="Board"]').trigger('click')

    expect(page.find('[data-testid="task-list-view"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="task-board-card"]')).toHaveLength(8)
  })

  it('filters the shared collection by source', async () => {
    const page = mountWorkspace()
    await page.get('[role="combobox"][aria-label="Filter by source"]').trigger('click')
    const body = new DOMWrapper(document.body)
    const messageOption = body
      .findAll('[role="menuitem"]')
      .find((item) => item.text().includes('Message'))
    expect(messageOption).toBeDefined()
    await messageOption!.trigger('click')

    const rows = page.findAll('[data-testid="task-list-row"]')
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.attributes('data-task-id')?.startsWith('MSG-'))).toBe(true)
  })

  it('shows human and Agent collaborators with distinct roles', async () => {
    const page = mountWorkspace()
    const task = page.get('[data-task-id="GH-287"]')

    expect(task.find('[data-agent-provider="codex"]').exists()).toBe(true)
    expect(task.find('[data-agent-provider="claude"]').exists()).toBe(true)
    expect(task.text()).toContain('Implementation')
    expect(task.text()).toContain('Review')

    await task.trigger('click')
    const body = new DOMWrapper(document.body)
    expect(body.findAll('[data-testid="task-detail-collaborator"]')).toHaveLength(3)
    expect(body.get('[data-testid="task-detail"]').text()).toContain('Codex Agent')
    expect(body.get('[data-testid="task-detail"]').text()).toContain('Claude Agent')
  })

  it('opens localized details and adds a comment', async () => {
    const page = mountWorkspace('zh-CN')
    await page.get('[data-task-id="LOCAL-018"]').trigger('click')
    const body = new DOMWrapper(document.body)

    expect(body.get('[data-testid="task-detail"]').text()).toContain('准备统一任务中心演示')
    await body.get('textarea[aria-label="评论"]').setValue('演示流程已经确认。')
    const commentButton = body
      .findAll('button')
      .find((button) => button.text().includes('发表评论'))
    expect(commentButton).toBeDefined()
    await commentButton!.trigger('click')

    expect(body.findAll('[data-testid="task-comment"]')).toHaveLength(1)
    expect(body.get('[data-testid="task-detail"]').text()).toContain('演示流程已经确认。')
  })

  it('creates a local task and opens its detail', async () => {
    const page = mountWorkspace()
    const createButton = page.findAll('button').find((button) => button.text().includes('New task'))
    expect(createButton).toBeDefined()
    await createButton!.trigger('click')

    const body = new DOMWrapper(document.body)
    await body.get('input[aria-label="Task name"]').setValue('Confirm demo follow-up')
    const submit = body.findAll('button').find((button) => button.text().includes('Create task'))
    expect(submit).toBeDefined()
    await submit!.trigger('click')

    expect(body.get('[data-testid="task-detail"]').text()).toContain('Confirm demo follow-up')
    expect(page.findAll('[data-testid="task-list-row"]')).toHaveLength(9)
  })
})
