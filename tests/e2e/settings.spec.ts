import { expect, test } from './fixtures/app'

test('renders English notification settings without horizontal overflow', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture('settings', { lang: 'en' })

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Show desktop notifications')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Message' })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
})

test('renders Chinese notification settings at 390px without overflow', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixture('settings', { lang: 'zh-CN' })

  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page.getByText('显示桌面通知')).toBeVisible()
  await expect(page.getByRole('radio', { name: '消息内容' })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
})

test('disables all settings controls while saving', async ({ openFixture, page }) => {
  await openFixture('settings-saving')

  await expect(page.getByRole('status')).toContainText('Saving changes')
  await expect(page.locator('input[type="checkbox"]:disabled')).toHaveCount(2)
  await expect(page.getByRole('radiogroup').nth(2).locator('button:disabled')).toHaveCount(3)
})

test('disables notification dependencies when desktop alerts are off', async ({
  openFixture,
  page,
}) => {
  await openFixture('settings-disabled')

  const checkboxes = page.locator('input[type="checkbox"]')
  await expect(checkboxes.nth(0)).toBeEnabled()
  await expect(checkboxes.nth(1)).toBeDisabled()
  await expect(page.getByRole('radiogroup').nth(2).locator('button:disabled')).toHaveCount(3)
})
