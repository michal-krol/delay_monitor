import { test, expect } from '@playwright/test'

// Mock ma prawdziwe ID: Warszawa Centralna 33605 (AGENTS.md #8).
const STATION = { id: '33605', name: 'Warszawa Centralna' }
const boardUrl = `/station/${STATION.id}?name=${encodeURIComponent(STATION.name)}`

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
  await expect(page).toHaveURL(/\/connection\//)
})

test('linie GTFS: strona Linie pokazuje sekcje z liniami miasta', async ({ page }) => {
  await page.goto('/city/warszawa/lines')

  await expect(page.getByRole('heading', { name: 'Linie — Warszawa' })).toBeVisible()

  // GTFS mock parsuje się raz przy starcie (~kilkanaście s), strona sama ponawia.
  await expect(page.getByLabel('Szukaj linii')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('line-section').first()).toBeVisible()
  // Na wąskim ekranie sekcje startują zwinięte — kafle widać po rozwinięciu pierwszej.
  const first = page.getByTestId('line-section').first()
  if (!(await first.evaluate((node) => (node as HTMLDetailsElement).open))) await first.locator('summary').click()
  await expect(page.getByRole('link', { name: /^Linia / }).first()).toBeVisible()
})

test('tablica → szczegóły → wstecz: bezpośrednie wejście na stację wraca do tablicy', async ({ page }) => {
  // Regresja: `patchUrlParams` (replaceState przy montowaniu) kasował stan
  // historii Next na wpisie załadowanym bezpośrednio, więc „wstecz" zmieniało
  // tylko URL, a widok zostawał na szczegółach połączenia.
  await page.goto(boardUrl)

  const rowButton = page.locator('td button[aria-label]').first()
  await expect(async () => {
    await page.reload()
    await expect(rowButton).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })

  await rowButton.click()
  await expect(page).toHaveURL(/\/connection\//)

  await page.goBack()
  await expect(page).toHaveURL(/\/station\/33605/)
  await expect(page.getByRole('tablist', { name: 'Kierunek' })).toBeVisible()
  // Wiersze wracają z pamięci klienta od razu (cache `usePolling`), bez czekania na nowe
  // zapytanie ani na komunikat „Ładowanie" -- limit << 30 s odświeżania.
  await expect(page.locator('td button[aria-label]').first()).toBeVisible({ timeout: 2_000 })
})
