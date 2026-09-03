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
  await expect(githubTask.locator('[data-agent-provider="codex"]')).toBeVisible()
  await expect(githubTask).toContainText('Implementation')
  await expect(githubTask).not.toContainText('GitHub')
  await githubTask.click()
  const detail = page.getByTestId('task-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('GitHub')
  await expect(detail).toContainText('Frontend')
  await expect(detail.getByTestId('task-detail-collaborator')).toHaveCount(3)
  await expect(detail).toContainText('Codex Agent')
  await expect(detail).toContainText('Claude Agent')
})

test('keeps the localized task workspace usable at 390px', async ({ openFixture, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixture('tasks', { lang: 'zh-CN' })

  await expect(page.getByRole('heading', { name: '任务', exact: true })).toBeVisible()
  await page.getByTestId('task-list-row').filter({ hasText: 'LOCAL-018' }).click()
  await expect(page.getByRole('dialog', { name: '准备统一任务中心演示' })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
