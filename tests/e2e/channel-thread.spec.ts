import { expect, test } from './fixtures/app'

test('opens a thread from the timeline and sends a reply', async ({ openFixture, page }) => {
  await openFixture('thread-empty')

  const thread = page.getByRole('dialog', { name: 'Thread' })
  await expect(thread).toBeVisible()
  await expect(thread.getByText('No replies yet. Start the thread.')).toBeVisible()

  await thread.getByRole('button', { name: 'Close thread' }).click()
  await expect(thread).toBeHidden()
  const rootMessage = page.locator('[data-message-id="message-1"]')
  await rootMessage.hover()
  await rootMessage.getByRole('button', { name: 'Open thread' }).click()
  await expect(thread).toBeVisible()

  await thread.getByRole('textbox', { name: 'Reply in thread' }).fill('A follow-up decision')
  await thread.getByRole('button', { name: 'Send reply' }).click()
  await expect(thread.getByText('A follow-up decision')).toBeVisible()
})

test('renders replies and recovers loading and error fixtures', async ({ openFixture, page }) => {
  await openFixture('thread-replies')
  const thread = page.getByRole('dialog', { name: 'Thread' })
  await expect(thread.getByText('Keep the decision attached to its source message.')).toBeVisible()
  await expect(thread.getByText('I will use this thread for the review follow-up.')).toBeVisible()

  await openFixture('thread-loading')
  await expect(page.getByRole('status')).toContainText('Loading thread')

  await openFixture('thread-error')
  await expect(page.getByRole('alert')).toContainText('Could not load this thread (transport)')
  await page.getByRole('button', { name: 'Retry thread' }).click()
  await expect(page.getByText('No replies yet. Start the thread.')).toBeVisible()
})

test('keeps revoked and deleted roots out of a normal thread state', async ({
  openFixture,
  page,
}) => {
  await openFixture('thread-root-revoked')
  await expect(page.getByText('This message was revoked.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Thread' })).toHaveCount(0)

  await openFixture('thread-root-deleted')
  await expect(
    page.getByText(
      'Can we move Agent collaboration into a drawer and keep the Channel timeline clean?',
    ),
  ).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Thread' })).toHaveCount(0)
})
