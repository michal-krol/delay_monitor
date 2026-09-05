import { test, expect } from '@playwright/test'

const READY = 45_000

test('linia: aktywny alert z fixture\'u pokazuje baner utrudnienia', async ({ page }) => {
  await page.goto('/miasto/warszawa/linia/20')
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
  await expect(page.getByRole('link', { name: /Szczegóły/ })).toHaveAttribute('href', 'https://www.wtp.waw.pl/utrudnienia/test-1/')
})

test('linia: przystanek bez pasującego alertu (linia 999 z fixture\'u) nie pokazuje banera', async ({ page }) => {
  await page.goto('/miasto/warszawa/linia/20')
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByText('Utrudnienie na linii spoza fixture\'u')).not.toBeVisible()
})
