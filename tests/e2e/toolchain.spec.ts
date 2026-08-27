import { expect, test } from './fixtures/app'

test('boots the web application shell', async ({ openApp, page }) => {
  await openApp()
  await expect(page.locator('html')).toHaveAttribute('lang', /^(en|zh-CN)$/)
})
