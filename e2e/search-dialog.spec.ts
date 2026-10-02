import { test, expect, type Page } from '@playwright/test'

// Globalne okno wyszukiwania (`SearchDialog`): przycisk „Szukaj" w nagłówku (telefon) albo w pasku
// bocznym i skróty Ctrl/Cmd+K, „/" (desktop). Mock: stacja PKP „Warszawa Centralna" (33605)
// i zespół GTFS „Centrum" (1001); `rail=all` zwraca obie grupy, „Centr" pasuje do obu.
const READY = 45_000
const DIALOG = 'Szukaj stacji lub przystanku'
const INPUT = 'Szukaj stacji lub przystanku…'

async function openSearch(page: Page, project: string) {
  // Przycisk i skróty działają dopiero po hydracji; klik/klawisz przed nią znika bez śladu (flaky na zimnym starcie).
  await page.waitForLoadState('networkidle')
  if (project === 'desktop-chromium') await page.keyboard.press('Control+K')
  else await page.getByRole('button', { name: 'Szukaj' }).click()
  const dialog = page.getByRole('dialog', { name: DIALOG })
  await expect(dialog).toBeVisible()
  return dialog
}

test('otwarcie: okno widoczne, pole wyszukiwania ma fokus', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await expect(dialog.getByRole('combobox', { name: INPUT })).toBeFocused({ timeout: READY })
})

test('desktop: „/" poza polem tekstowym otwiera okno, a przycisk w pasku bocznym też', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'skróty klawiszowe tylko na desktopie')

  await page.goto('/')
  await page.waitForLoadState('networkidle') // skrót to nasłuch po hydracji
  await page.keyboard.press('/')
  await expect(page.getByRole('dialog', { name: DIALOG })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()

  await page.getByRole('button', { name: /^Szukaj/ }).click()
  await expect(page.getByRole('dialog', { name: DIALOG })).toBeVisible()
})

test('„Centr" → stacja kolejowa i przystanek miejski; wybór przystanku nawiguje i zamyka okno', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await dialog.getByRole('combobox', { name: INPUT }).fill('Centr')
  await expect(dialog.getByRole('option', { name: 'Warszawa Centralna' })).toBeVisible({ timeout: READY })
  const stop = dialog.getByRole('option', { name: 'Centrum' })
  await expect(stop).toBeVisible()

  await stop.click()
  await expect(page).toHaveURL(/\/city\/warszawa\/stop\/1001/)
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})

test('stacja kolejowa z wyników otwiera tablicę /station', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await dialog.getByRole('combobox', { name: INPUT }).fill('Warsz')
  await dialog.getByRole('option', { name: 'Warszawa Centralna' }).click({ timeout: READY })
  await expect(page).toHaveURL(/\/station\/33605/)
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})

test('„Ostatnio oglądane" w oknie wyszukiwania pokazuje odwiedzony przystanek', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await dialog.getByRole('combobox', { name: INPUT }).fill('Centr')
  await dialog.getByRole('option', { name: 'Centrum' }).click({ timeout: READY })
  await expect(page).toHaveURL(/\/city\/warszawa\/stop\/1001/)
  // Przystanek zapisuje się jako oglądany w efekcie po wczytaniu tablicy (nie razem z h1) — czekamy na sam zapis.
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('monitor.recentPlaces.v1')), { timeout: READY })
    .toContain('Centrum')

  const reopened = await openSearch(page, testInfo.project.name)
  const recent = reopened.getByRole('region', { name: 'Ostatnio oglądane' })
  await expect(recent.getByRole('link', { name: 'Centrum' })).toBeVisible()
})

test('Escape zamyka okno', async ({ page }, testInfo) => {
  await page.goto('/')
  await openSearch(page, testInfo.project.name)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})

test('„Zamknij" zamyka okno', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await dialog.getByRole('button', { name: 'Zamknij' }).click()
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})

test('„/" wpisane w polu wyszukiwania na stronie miasta nie otwiera okna', async ({ page }) => {
  await page.goto('/city/warszawa')
  const input = page.getByRole('combobox', { name: /Szukaj stacji kolejowej lub przystanku miejskiego/ })
  await input.click()
  await page.keyboard.type('a/b')
  await expect(input).toHaveValue('a/b')
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})
