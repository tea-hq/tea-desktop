import { expect, test } from './fixtures/app'

test('switches the same task collection between list and board views', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFixture('tasks')

  await expect(page.getByTestId('task-list-row')).toHaveCount(8)
  await page.getByRole('radio', { name: 'Board' }).click()
  await expect(page.getByTestId('task-board-card')).toHaveCount(8)

  const githubTask = page.getByTestId('task-board-card').filter({ hasText: 'GH-287' })
  await expect(githubTask.locator('.i-mdi-github')).toBeVisible()
  const summary = githubTask.getByTestId('task-collaborators')
  await expect(summary.getByTestId('task-collaborator')).toHaveCount(3)
  await expect(summary.locator('[data-agent-provider="codex"]')).toHaveAttribute(
    'title',
    'Codex · Implementation',
  )
  await expect(githubTask).not.toContainText('Implementation')
  await expect(githubTask).not.toContainText('GitHub')
  await githubTask.click()
  const detail = page.getByTestId('task-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('GitHub')
  await expect(detail).toContainText('Frontend')
  const detailCollaborators = detail.getByTestId('task-collaborators')
  await expect(detailCollaborators.getByTestId('task-collaborator')).toHaveCount(3)
  await expect(detailCollaborators.locator('[data-agent-provider="codex"]')).toHaveAttribute(
    'title',
    'Codex · Implementation',
  )
  await expect(detailCollaborators.locator('[data-agent-provider="claude"]')).toHaveAttribute(
    'title',
    'Claude · Review',
  )
  await expect(detail.getByTestId('task-comment')).toHaveCount(3)
  await expect(
    detail.getByTestId('task-comment').locator('[data-agent-provider="codex"]'),
  ).toBeVisible()
  await expect(
    detail.getByTestId('task-comment').locator('[data-agent-provider="claude"]'),
  ).toBeVisible()
})

test('shows awaiting approval in the list, board card, and detail', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFixture('tasks', { lang: 'zh-CN' })

  const approvalRow = page.getByTestId('task-list-row').filter({ hasText: 'JIRA-681' })
  await expect(approvalRow).toHaveAttribute('data-task-status', 'approval')
  await expect(page.getByText('待审批', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: '看板' }).click()
  const approvalCard = page.getByTestId('task-board-card').filter({ hasText: 'JIRA-681' })
  await expect(approvalCard).toHaveAttribute('data-task-status', 'approval')
  await expect(approvalCard).toContainText('待审批')

  await approvalCard.click()
  const detail = page.getByTestId('task-detail')
  await expect(detail).toHaveAttribute('data-task-status', 'approval')
  await expect(page.getByRole('combobox', { name: '修改任务状态' })).toContainText('待审批')
  const approvalPanel = detail.getByTestId('task-approval-panel')
  await expect(approvalPanel).toContainText('Claude 需要你的决定')
  await expect(approvalPanel.locator('[data-question-kind]')).toHaveCount(1)
  await expect(approvalPanel.locator('[data-question-kind]')).toHaveAttribute(
    'data-question-kind',
    'single',
  )

  const submit = approvalPanel.getByTestId('task-approval-submit')
  await expect(submit).toBeDisabled()
  const sharedCore = approvalPanel.locator('[data-option-id="shared-core"]')
  await sharedCore.click()
  await expect(sharedCore).toHaveAttribute('aria-checked', 'true')
  await expect(submit).toBeEnabled()

  await approvalPanel.getByTestId('task-approval-custom-toggle').click()
  await approvalPanel.getByRole('textbox', { name: '自定义回复' }).fill('保留回滚入口。')
  await expect(sharedCore).toHaveAttribute('aria-checked', 'false')
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect(detail).toHaveAttribute('data-task-status', 'inProgress')
  await expect(detail.getByTestId('task-approval-submitted')).toContainText('决定已提交')
})

test('keeps the localized task workspace usable at 390px', async ({ openFixture, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixture('tasks', { lang: 'zh-CN' })

  await expect(page.getByRole('heading', { name: '任务', exact: true })).toBeVisible()
  await page.getByTestId('task-list-row').filter({ hasText: 'JIRA-681' }).click()
  await expect(page.getByRole('dialog', { name: '定义跨来源任务契约' })).toBeVisible()
  await expect(page.getByTestId('task-approval-panel')).toContainText('Claude 需要你的决定')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
