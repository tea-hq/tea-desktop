import { expect, test } from './fixtures/app'

test('reuses the full Agent surface with model, permission, Role, and approval', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 })
  await openFixture('full-agent')

  await expect(page.getByRole('heading', { name: 'Agent drawer architecture' })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(2)
  await expect(page.getByText('Claude Code', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Select model' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Select model' }).click()
  await expect(page.getByRole('menu', { name: 'Select model' })).toBeVisible()
  await expect(page.getByRole('menu', { name: 'Select model' })).toContainText('5.6 Terra')
  await page.getByRole('menuitemradio', { name: '5.6 Terra', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Select model' })).toContainText('5.6 Terra')
  await page.getByRole('menuitem', { name: /Effort/ }).click()
  await expect(page.getByRole('menu', { name: 'Select model' })).toContainText('Extra High')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Reviewer', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select role' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reviewer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Use prompt' })).toBeVisible()
  await expect(page.getByText('workspace.edit')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load earlier messages' })).toBeVisible()

  await expect(page.getByRole('button', { name: 'New Conversation' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Choose another Agent' })).toHaveCount(0)

  await page.getByRole('button', { name: 'New Conversation' }).click()
  const agentModel = page.getByRole('combobox', { name: 'Select model' })
  await expect(agentModel).not.toContainText('Claude Code')
  await expect(agentModel.locator('[role="img"][aria-label="Claude Code"]')).toBeVisible()
  await agentModel.click()
  const agentModelMenu = page.getByRole('menu', { name: 'Select model' })
  await expect(agentModelMenu.getByRole('tablist')).toBeVisible()
  await agentModelMenu.getByRole('tab', { name: 'Codex' }).click()
  await expect(agentModelMenu).toContainText('5.6 Terra')
  await agentModelMenu.getByRole('menuitemradio', { name: '5.6 Terra', exact: true }).click()
  await expect(agentModel).toContainText('5.6 Terra')
  await expect(agentModel).not.toContainText('Codex')
  await expect(agentModel.locator('[role="img"][aria-label="Codex"]')).toBeVisible()

  const thinking = page.getByRole('combobox', { name: 'Select thinking effort' })
  await expect(thinking).toContainText('Extra High')
  await thinking.click()
  await page.getByRole('menuitem', { name: 'Ultra', exact: true }).click()
  await expect(thinking).toContainText('Ultra')
})

test('captures the full Agent workspace', async ({ openFixture, page }, testInfo) => {
  test.skip(
    testInfo.project.name.includes('reduced'),
    'Visual baseline is shared with the normal-motion project.',
  )
  await page.setViewportSize({ width: 1100, height: 760 })
  await openFixture('full-agent')
  await expect(page).toHaveScreenshot('full-agent-1100x760.png', { animations: 'disabled' })
})
