import { expect, test } from './fixtures/app'

test('opens visual media in one viewer and navigates with the keyboard', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture('media-image-viewer')

  const imageDialog = page.getByRole('dialog', { name: 'channel-media-review.svg preview' })
  await expect(imageDialog).toBeVisible()
  await expect(imageDialog.locator('img')).toBeVisible()
  await expect(page.locator('.channel-message video[controls]')).toHaveCount(0)

  await page.keyboard.press('ArrowRight')
  const videoDialog = page.getByRole('dialog', { name: 'channel-media-review.mp4 preview' })
  await expect(videoDialog).toBeVisible()
  await expect(videoDialog.locator('video[controls]')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(videoDialog).toBeHidden()
})

test('projects save, retry, cancellation, and missing-source states', async ({
  openFixture,
  page,
}) => {
  await openFixture('media-saving')
  await page.getByRole('button', { name: 'Cancel attachment save' }).first().click()
  await expect(page.getByRole('button', { name: 'Save attachment' }).first()).toBeVisible()

  await openFixture('media-error')
  await page.getByRole('button', { name: 'Retry attachment save' }).click()
  await expect(page.getByRole('button', { name: 'Cancel attachment save' })).toBeVisible()

  await openFixture('media-missing')
  const missing = page.locator('[data-message-id="message-media-missing"]')
  await expect(missing.getByText('rollout-checklist.pdf')).toBeVisible()
  await expect(missing.locator('a')).toHaveCount(0)
  await expect(missing.getByRole('button', { name: 'Retry attachment save' })).toBeDisabled()
})

test('keeps the Chinese image viewer usable at 390px', async ({ openFixture, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixture('media-image-viewer', { lang: 'zh-CN' })

  await expect(page.getByRole('dialog', { name: 'channel-media-review.svg 预览' })).toBeVisible()
  await expect(page.getByRole('button', { name: '下一个媒体' })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
})
