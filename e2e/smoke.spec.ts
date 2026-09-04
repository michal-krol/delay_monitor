import { test, expect } from '@playwright/test'

// Mock ma prawdziwe ID: Warszawa Centralna 33605 (AGENTS.md #8).
const STATION = { id: '33605', name: 'Warszawa Centralna' }
const boardUrl = `/odjazdy/${STATION.id}?name=${encodeURIComponent(STATION.name)}`

test('pulpit: pusty stan z wyszukiwarką stacji', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pulpit' })).toBeVisible()
  await expect(page.getByRole('combobox')).toBeVisible()
})

test('tablica stacji: powłoka renderuje się natychmiast, bez czekania na dane', async ({ page }) => {
  await page.goto(boardUrl)
  await expect(page.getByRole('heading', { name: STATION.name, exact: true })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Kierunek' })).toBeVisible()
})

test('tablica → wiersze połączeń → szczegóły połączenia po kliknięciu', async ({ page }) => {
  await page.goto(boardUrl)

  // Poller wypełnia snapshot async (~kilka s), a klient po serii szybkich prób
  // odpytuje dopiero co 30 s — wymuszamy świeże zapytanie przez reload zamiast
  // czekać w oknie martwym.
  const rowButton = page.locator('td button[aria-label]').first()
  await expect(async () => {
    await page.reload()
    await expect(rowButton).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })

  await rowButton.click()
  await expect(page).toHaveURL(/\/polaczenie\//)
})

test('linie GTFS: przeglądarka linii miasta pokazuje siatkę linii', async ({ page }) => {
  await page.goto('/miasto/warszawa/linie')

  await expect(page.getByRole('heading', { name: 'Trasy — Warszawa' })).toBeVisible()
  await expect(page.getByLabel('Szukaj linii')).toBeVisible()

  // GTFS mock parsuje się raz przy starcie (~kilkanaście s), strona sama ponawia.
  await expect(page.getByRole('link', { name: /^Linia / }).first()).toBeVisible({ timeout: 45_000 })
})
