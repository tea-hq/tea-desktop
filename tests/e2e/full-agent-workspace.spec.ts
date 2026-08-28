import { expect, test } from './fixtures/app'

test('reuses the full Agent surface with model, permission, Role, and approval', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 })
  await openFixture('full-agent')

  await expect(page.getByRole('heading', { name: 'Agent drawer architecture' })).toBeVisible()
  await expect(page.getByLabel('Select model')).toBeVisible()
  await expect(page.getByLabel('Select permission mode')).toBeVisible()
  await expect(page.getByLabel('Select role')).toBeVisible()
  await expect(page.getByText('workspace.edit')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load earlier messages' })).toBeVisible()
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
