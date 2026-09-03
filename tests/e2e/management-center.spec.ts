import { expect, test } from './fixtures/app'

test('syncs the cloud catalog and moves between management centers', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFixture('management')

  await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible()
  await expect(page.getByText('GitHub', { exact: true })).toBeVisible()
  await expect(page.getByText('Grafana', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sync cloud catalog' }).click()

  await page.getByRole('button', { name: 'Credentials' }).click()
  await expect(page.getByRole('heading', { name: 'Credentials' })).toBeVisible()
  await page.getByRole('button', { name: 'Skills' }).click()
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible()
  await page.getByRole('button', { name: 'Agent roles' }).click()
  await expect(page.getByRole('heading', { name: 'Agent roles' })).toBeVisible()

  await page.locator('header').getByRole('button', { name: 'New role brief' }).click()
  await expect(page.getByRole('textbox', { name: 'Role brief' })).toBeFocused()
  await page
    .getByRole('textbox', { name: 'Role brief' })
    .fill('A release coordinator for weekly shipping')
  await page.getByRole('button', { name: 'Queue brief' }).click()
  await expect(page.getByText('A release coordinator for weekly shipping')).toBeVisible()
})

test('keeps the management centers usable on a narrow Chinese viewport', async ({
  openFixture,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixture('management', { lang: 'zh-CN' })

  await expect(page.getByRole('heading', { name: '插件中心' })).toBeVisible()
  await page.getByRole('button', { name: '凭据中心' }).click()
  await expect(page.getByRole('heading', { name: '凭据中心' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
