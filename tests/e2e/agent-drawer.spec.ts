import { expect, test } from './fixtures/app'

test('moves from empty history to preparing and creates on first send', async ({ openFixture, page }) => {
  await openFixture('drawer-empty')

  await expect(page.getByText('No Agent conversations for this channel yet.')).toBeVisible()
  await page.getByRole('button', { name: 'New session with Claude Code' }).click()
  const composer = page.getByRole('textbox', { name: 'Ask anything, plan a change, or explore a codebase…' })
  await expect(composer).toBeFocused()
  await composer.fill('Create the implementation plan')
  await page.locator('.p-drawer').getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Create the implementation plan')).toBeVisible()
  await expect(page.getByText('New Agent session')).toBeVisible()
})

test('edits, saves, delivers, and closes a Channel Draft', async ({ openFixture, page }) => {
  await openFixture('draft-dialog')
  const dialog = page.getByRole('dialog', { name: 'Channel Draft' })
  const editor = dialog.getByRole('textbox', { name: 'Channel Draft' })
  await editor.fill('Updated Channel Draft content')
  await dialog.getByRole('button', { name: 'Save version' }).click()
  await dialog.getByRole('button', { name: 'Review and send' }).click()
  await expect(dialog.getByText('Sent')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('shows recent sessions, expands to all, and filters', async ({ openFixture, page }) => {
  await openFixture('drawer-recent')

  await expect(page.locator('.session-row')).toHaveCount(8)
  await page.getByRole('button', { name: 'View all sessions' }).click()
  await expect(page.locator('.session-row')).toHaveCount(10)
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('Product session 10')
  await expect(page.locator('.session-row')).toHaveCount(1)
})

test('renders the narrow drawer without overlap', async ({ openFixture, page }, testInfo) => {
  test.skip(testInfo.project.name.includes('reduced'), 'Visual baseline is shared with the normal-motion project.')
  await page.setViewportSize({ width: 480, height: 760 })
  await openFixture('drawer-active')
  await expect(page).toHaveScreenshot('drawer-active-480x760.png', { animations: 'disabled' })
})
