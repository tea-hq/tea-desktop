import { expect, test } from './fixtures/app'

test('restores focus after closing the drawer with Escape', async ({ openFixture, page }) => {
  await openFixture('channel')
  const trigger = page.getByRole('button', { name: 'Show detail panel' })
  await trigger.click()
  await expect(page.getByText('Agent collaboration', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Agent collaboration', { exact: true })).toBeHidden()
})

test('renders localized Chinese controls without horizontal overflow', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 760 })
  await openFixture('drawer-empty', { lang: 'zh-CN' })
  await expect(page.getByText('还没有 Agent 会话')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})

test('follows the dark system palette before app state is loaded', async ({
  openFixture,
  page,
}) => {
  await openFixture('channel', { colorScheme: 'dark' })

  await expect(page.getByTestId('e2e-app')).toBeVisible()
  const palette = await page.evaluate(() => ({
    canvas: getComputedStyle(document.documentElement).getPropertyValue('--tea-canvas').trim(),
    background: getComputedStyle(document.querySelector<HTMLElement>('[data-testid="e2e-app"]')!)
      .backgroundColor,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }))

  expect(palette.canvas).toBe('#111111')
  expect(palette.background).toBe('rgb(17, 17, 17)')
  expect(palette.colorScheme).toBe('dark')
})

test('honors reduced motion while preserving visible focus', async ({
  openFixture,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes('reduced'),
    'Reduced-motion assertion only runs in its configured project.',
  )
  await openFixture('drawer-preparing')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  )
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus-visible')
  await expect(focused).toBeVisible()
  const duration = await focused.evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(duration).toMatch(/0\.01ms|1e-05s|0s/)
})
