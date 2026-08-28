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
