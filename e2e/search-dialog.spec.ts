import { test, expect } from '@playwright/test'
import { openSearch, searchField, SEARCH_DIALOG as DIALOG } from './helpers/search'

// Globalne okno wyszukiwania (`SearchDialog` na `UnifiedSearch`) — tylko od `sm` (desktop-chromium): Ctrl/Cmd+K,
// „/" i przycisk w pasku bocznym. Poniżej `sm` „Szukaj" prowadzi na stronę `/search` (`unified-search.spec.ts`).
// Mock: stacja PKP „Warszawa Centralna" (33605) i zespół GTFS „Centrum" (1001); „Centr" pasuje do obu.
test.skip(({ isMobile }) => isMobile, 'okno wyszukiwania tylko od sm; telefon ma stronę /search')

const READY = 45_000
const RAIL_ROW = /^Warszawa Centralna, Stacja kolejowa PKP/
const STOP_ROW = /^Centrum, Zespół przystanków · Warszawa/

test('otwarcie: okno widoczne, pole wyszukiwania ma fokus', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await expect(searchField(dialog)).toBeFocused({ timeout: READY })
})

test('„/" poza polem tekstowym otwiera okno, a przycisk w pasku bocznym też', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle') // skrót to nasłuch po hydracji
  await page.keyboard.press('/')
  await expect(page.getByRole('dialog', { name: DIALOG })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()

  await page.getByRole('button', { name: /^Szukaj/ }).click()
  await expect(page.getByRole('dialog', { name: DIALOG })).toBeVisible()
})

test('„Centr" → stacja kolejowa i przystanek miejski w osobnych grupach; wybór przystanku nawiguje i zamyka okno', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await searchField(dialog).fill('Centr')
  await expect(dialog.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
  const stop = dialog.getByRole('button', { name: STOP_ROW })
  await expect(stop).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Stacje kolejowe' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Przystanki' })).toBeVisible()

  await stop.click()
  await expect(page).toHaveURL(/\/city\/warszawa\/stop\/1001/)
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})

test('stacja kolejowa z wyników otwiera tablicę /station', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await searchField(dialog).fill('Warsz')
  await dialog.getByRole('button', { name: RAIL_ROW }).click({ timeout: READY })
  await expect(page).toHaveURL(/\/station\/33605/)
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})

test('bez listy miast stacje PKP i tak się wyszukują', async ({ page }, testInfo) => {
  await page.route('**/api/cities', (route) => route.fulfill({ status: 500, json: { error: 'x' } }))
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await searchField(dialog).fill('Warsz')
  await expect(dialog.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
  await expect(dialog.getByRole('heading', { name: 'Przystanki' })).toHaveCount(0)
})

test('„Ostatnio oglądane" w oknie wyszukiwania pokazuje odwiedzony przystanek', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  await searchField(dialog).fill('Centr')
  await dialog.getByRole('button', { name: STOP_ROW }).click({ timeout: READY })
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
  // Bez hydracji listener „/" jeszcze nie istnieje i test przechodziłby na próżno.
  await page.waitForLoadState('networkidle')
  const input = page.getByRole('combobox', { name: /Szukaj stacji kolejowej lub przystanku miejskiego/ })
  await input.click()
  await page.keyboard.type('a/b')
  await expect(input).toHaveValue('a/b')
  await expect(page.getByRole('dialog', { name: DIALOG })).not.toBeVisible()
})

test('„/" wpisane w polu okna to zwykły znak: okno zostaje otwarte, fraza w polu', async ({ page }, testInfo) => {
  await page.goto('/')
  const dialog = await openSearch(page, testInfo.project.name)
  const field = searchField(dialog)
  await field.click()
  await page.keyboard.type('a/b')
  await expect(field).toHaveValue('a/b')
  await expect(dialog).toBeVisible()
})
