import { expect, test } from './fixtures/app'

test('moves from empty history to preparing and creates on first send', async ({
  openFixture,
  page,
}) => {
  await openFixture('drawer-empty')

  const drawer = page.getByRole('dialog', { name: 'Agent collaboration' })
  await expect(drawer.getByText('No Agent sessions yet')).toBeVisible()
  await expect(drawer.getByRole('combobox')).toHaveCount(0)
  const create = drawer.getByRole('button', { name: 'New session', exact: true })
  await expect(create).toHaveAttribute('title', 'New session')
  await expect(create).toHaveText('')
  await create.click()
  const composer = page.getByRole('textbox', {
    name: 'Ask anything, plan a change, or explore a codebase…',
  })
  await expect(composer).toBeFocused()
  await composer.fill('Create the implementation plan')
  await page.getByRole('dialog').getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Create the implementation plan')).toBeVisible()
  await expect(page.getByText('New Agent session')).toBeVisible()
})

test('starts an empty drawer session with an alternate Agent', async ({ openFixture, page }) => {
  await openFixture('drawer-empty')

  const drawer = page.getByRole('dialog', { name: 'Agent collaboration' })
  await drawer.getByRole('button', { name: 'Choose another Agent' }).click()
  const agentMenu = page.getByRole('menu', { name: 'Choose Agent runtime' })
  await agentMenu.getByRole('menuitem', { name: 'Codex', exact: true }).click()

  await expect(drawer.getByRole('heading', { name: 'New session' })).toBeVisible()
  await expect(drawer.getByText('Codex', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('combobox')).toHaveCount(2)
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
  const viewAll = page.getByRole('button', { name: 'View all sessions' })
  await expect(viewAll).toHaveAttribute('title', 'View all sessions')
  await expect(viewAll).toHaveText('')
  await viewAll.click()
  await expect(page.locator('.session-row')).toHaveCount(10)
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('Product session 10')
  await expect(page.locator('.session-row')).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('Missing session')
  await expect(page.getByText('No sessions match your search.')).toBeVisible()
})

test('renders the empty and recent session indexes without overlap', async ({
  openFixture,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes('reduced'),
    'Visual baseline is shared with the normal-motion project.',
  )
  await page.setViewportSize({ width: 480, height: 760 })

  await openFixture('drawer-empty')
  await expect(page).toHaveScreenshot('drawer-empty-480x760.png', { animations: 'disabled' })

  await openFixture('drawer-recent')
  await expect(page).toHaveScreenshot('drawer-recent-480x760.png', { animations: 'disabled' })
})

test('renders the narrow drawer without overlap', async ({ openFixture, page }, testInfo) => {
  test.skip(
    testInfo.project.name.includes('reduced'),
    'Visual baseline is shared with the normal-motion project.',
  )
  await page.setViewportSize({ width: 480, height: 760 })
  await openFixture('drawer-active')
  await expect(page).toHaveScreenshot('drawer-active-480x760.png', { animations: 'disabled' })
})
