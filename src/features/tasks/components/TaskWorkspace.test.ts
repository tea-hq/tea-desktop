// @vitest-environment happy-dom

import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import { createTaskDemoData } from '../taskDemoData'
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
  it('gives every demo task a deterministic activity history', () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en, 'zh-CN': zhCN } })
    const tasks = createTaskDemoData(i18n.global.t)

    expect(tasks.every((task) => task.comments.length >= 2)).toBe(true)
    expect(
      tasks
        .flatMap((task) => task.comments)
        .some((comment) => comment.author.provider === 'claude'),
    ).toBe(true)
    expect(
      tasks.flatMap((task) => task.comments).some((comment) => comment.author.provider === 'codex'),
    ).toBe(true)
  })

  it('projects one task collection into list and board views', async () => {
    const page = mountWorkspace()

    expect(page.findAll('[data-testid="task-list-row"]')).toHaveLength(8)
    await page.get('button[aria-label="Board"]').trigger('click')

    expect(page.find('[data-testid="task-list-view"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="task-board-card"]')).toHaveLength(8)
  })

  it('projects awaiting approval through the list, board card, and detail', async () => {
    const page = mountWorkspace('zh-CN')
    const approvalRow = page.get('[data-testid="task-list-row"][data-task-id="JIRA-681"]')

    expect(approvalRow.attributes('data-task-status')).toBe('approval')
    expect(page.text()).toContain('待审批')

    await page.get('button[aria-label="看板"]').trigger('click')
    const approvalCard = page.get('[data-testid="task-board-card"][data-task-id="JIRA-681"]')
    expect(approvalCard.attributes('data-task-status')).toBe('approval')
    expect(approvalCard.text()).toContain('待审批')

    await approvalCard.trigger('click')
    const body = new DOMWrapper(document.body)
    const detail = body.get('[data-testid="task-detail"]')
    expect(detail.attributes('data-task-status')).toBe('approval')
    expect(detail.get('[role="combobox"][aria-label="修改任务状态"]').text()).toContain('待审批')
    const approvalPanel = body.get('[data-testid="task-approval-panel"]')
    expect(approvalPanel.attributes('data-approval-status')).toBe('pending')
    expect(approvalPanel.text()).toContain('Claude 需要你的决定')
    expect(approvalPanel.find('[data-testid="task-agent-handoff"]').exists()).toBe(false)
    expect(approvalPanel.findAll('[data-question-kind]')).toHaveLength(1)
    expect(approvalPanel.get('[data-question-kind]').attributes('data-question-kind')).toBe(
      'single',
    )

    const submit = approvalPanel.get('[data-testid="task-approval-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    const sharedCore = approvalPanel.get('[data-option-id="shared-core"]')
    await sharedCore.trigger('click')
    expect(sharedCore.attributes('aria-checked')).toBe('true')
    expect(submit.attributes('disabled')).toBeUndefined()

    await approvalPanel.get('[data-testid="task-approval-custom-toggle"]').trigger('click')
    await approvalPanel.get('textarea[aria-label="自定义回复"]').setValue('保留回滚入口。')
    expect(sharedCore.attributes('aria-checked')).toBe('false')

    expect(submit.attributes('disabled')).toBeUndefined()
    await submit.trigger('click')

    expect(detail.attributes('data-task-status')).toBe('inProgress')
    expect(body.get('[data-testid="task-approval-submitted"]').text()).toContain('决定已提交')
    const handoff = body.get('[data-testid="task-agent-handoff"]')
    expect(handoff.text()).toContain('Agent 正在继续处理任务')
    expect(handoff.findAll('[data-step]')).toHaveLength(3)
    expect(body.findAll('[data-testid="task-comment"]')).toHaveLength(4)
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

    const summary = task.get('[data-testid="task-collaborators"]')
    expect(summary.findAll('[data-testid="task-collaborator"]')).toHaveLength(3)
    expect(summary.get('[data-agent-provider="codex"]').attributes('title')).toContain(
      'Implementation',
    )
    expect(summary.get('[data-agent-provider="claude"]').attributes('title')).toContain('Review')
    expect(task.text()).not.toContain('Implementation')

    await task.trigger('click')
    const body = new DOMWrapper(document.body)
    const detailSummary = body.get('[data-testid="task-detail"] [data-testid="task-collaborators"]')
    expect(detailSummary.findAll('[data-testid="task-collaborator"]')).toHaveLength(3)
    expect(detailSummary.get('[data-agent-provider="codex"]').attributes('title')).toContain(
      'Implementation',
    )
    expect(detailSummary.get('[data-agent-provider="claude"]').attributes('title')).toContain(
      'Review',
    )
    expect(
      body
        .get('[data-testid="task-comment"] [data-agent-provider="codex"]')
        .attributes('data-agent-provider'),
    ).toBe('codex')
    expect(
      body
        .get('[data-testid="task-comment"] [data-agent-provider="claude"]')
        .attributes('data-agent-provider'),
    ).toBe('claude')
  })

  it('uses distinct tones for tags in cards and details', async () => {
    const page = mountWorkspace()
    await page.get('button[aria-label="Board"]').trigger('click')

    const card = page.get('[data-testid="task-board-card"][data-task-id="JIRA-681"]')
    const cardTags = card.findAll('[data-testid="task-tag"]')
    expect(cardTags).toHaveLength(2)
    expect(cardTags[0]!.classes()).not.toEqual(cardTags[1]!.classes())

    await card.trigger('click')
    const body = new DOMWrapper(document.body)
    const detailTags = body.get('[data-testid="task-detail"]').findAll('[data-testid="task-tag"]')
    expect(detailTags).toHaveLength(2)
    expect(detailTags[0]!.classes()).not.toEqual(detailTags[1]!.classes())
  })

  it('opens localized details and adds a comment', async () => {
    const page = mountWorkspace('zh-CN')
    await page.get('[data-task-id="LOCAL-018"]').trigger('click')
    const body = new DOMWrapper(document.body)

    expect(body.get('[data-testid="task-detail"]').text()).toContain('准备统一任务中心演示')
    await body.get('textarea[aria-label="评论"]').setValue('演示流程已经确认。')
    const commentButton = body.get('button[aria-label="发表评论"]')
    expect(commentButton.text()).toBe('')
    await commentButton.trigger('click')

    expect(body.findAll('[data-testid="task-comment"]')).toHaveLength(3)
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
