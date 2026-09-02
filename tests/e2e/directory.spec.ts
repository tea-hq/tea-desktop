import { expect, test } from './fixtures/app'

test('renders the organization-aware member directory on desktop', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFixture('directory')

  await expect(page.getByTestId('directory-scope')).toContainText('Tea Product Studio')
  await expect(page.getByTestId('directory-member-row')).toHaveCount(4)
  await expect(page.getByTestId('directory-detail')).toContainText('Lin Zhixu')
  await expect(page.getByRole('columnheader')).toHaveCount(3)
})

test('opens localized member details without narrow-screen overflow', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixture('directory', { lang: 'zh-CN' })

  await page.getByTestId('directory-member-row').nth(3).click()
  const drawer = page.getByRole('dialog', { name: 'Song Yuan' })
  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText('暂无消息账号')
  await expect(drawer.getByRole('button', { name: '发消息' })).toBeDisabled()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
