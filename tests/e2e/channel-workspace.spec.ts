import { expect, test } from './fixtures/app'

test('keeps the Channel timeline primary and opens Agent work contextually', async ({
  openFixture,
  page,
}) => {
  await openFixture('channel')

  await expect(page.getByRole('heading', { name: 'Product design' })).toBeVisible()
  await expect(page.getByText('Can we move Agent collaboration into a drawer')).toBeVisible()
  await page.getByRole('button', { name: 'Show detail panel' }).click()
  await expect(page.getByText('Agent collaboration', { exact: true })).toBeVisible()
})

test('captures the wide Channel workspace', async ({ openFixture, page }, testInfo) => {
  test.skip(
    testInfo.project.name.includes('reduced'),
    'Visual baseline is shared with the normal-motion project.',
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFixture('channel')
  await expect(page).toHaveScreenshot('channel-1440x900.png', { animations: 'disabled' })
})

test('keeps message selection and forwarding usable at 390px in Chinese', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixture('message-selection', { lang: 'zh-CN' })

  await expect(page.getByText('已选 2/100 条')).toBeVisible()
  await expect(page.getByRole('button', { name: '逐条转发' })).toBeVisible()
  await expect(page.getByRole('button', { name: '合并转发' })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)

  await openFixture('message-forwarding', { lang: 'zh-CN' })
  await expect(page.getByRole('dialog', { name: '转发消息' })).toBeVisible()
  await expect(page.getByText('已选择 2 条消息')).toBeVisible()
  await expect(page.getByRole('radio', { name: '合并转发' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
})

test('renders merged cards and each archive viewer state', async ({ openFixture, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture('merged-card')
  await expect(
    page.getByRole('button', { name: 'Open chat history from Product design' }),
  ).toBeVisible()

  await openFixture('merged-viewer')
  await expect(page.getByRole('dialog', { name: 'Product design history' })).toBeVisible()
  await expect(page.getByText(/Can we move Agent collaboration/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Open chat history from Engineering' }),
  ).toBeVisible()

  await openFixture('merged-loading')
  await expect(page.getByRole('status')).toHaveText(/Loading chat history/)

  await openFixture('merged-error')
  await expect(page.getByRole('alert')).toContainText('archive_checksum_mismatch')
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText(/Can we move Agent collaboration/)).toBeVisible()
})
