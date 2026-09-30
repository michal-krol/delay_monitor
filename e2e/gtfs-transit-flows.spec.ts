import { test, expect } from '@playwright/test'

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s) — strony
// same ponawiają, więc czekamy z zapasem na pierwszą treść z rozkładu.
const READY = 45_000

test('ekran miasta: deep-link ?stop= renderuje osadzoną tablicę, „wróć" ją czyści', async ({ page }) => {
  await page.goto('/city/warszawa?stop=1001&name=Centrum')

  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible({ timeout: READY })
  // KPI zespołu chowane, gdy panel szczegółów jest otwarty.
  await expect(page.getByText('przystanki miejskie')).not.toBeVisible()

  await page.getByRole('button', { name: /Wróć do wyszukiwania/ }).click()
  await expect(page).toHaveURL(/\/city\/warszawa$/)
  await expect(page.getByText('przystanki miejskie')).toBeVisible()
})

test('strona Linie: sekcje per rodzaj środka, kafel metra prowadzi do linii', async ({ page }) => {
  await page.goto('/city/warszawa/lines')
  const sections = page.getByTestId('line-section')
  await expect(sections.first()).toBeVisible({ timeout: READY })

  // Kolejność metro → tramwaje → autobusy → kolej; puste rodzaje się nie pojawiają.
  await expect(page.locator('[data-testid="line-section"] > summary')).toHaveText([/^Metro/, /^Tramwaje/, /^Autobusy/, /^Kolej/])

  const metro = sections.first()
  if (!(await metro.evaluate((node) => (node as HTMLDetailsElement).open))) await metro.locator('summary').click()
  await expect(metro.getByRole('link', { name: /^Linia M/ }).first()).toBeVisible()
  await metro.getByRole('link', { name: /^Linia M/ }).first().click()
  await expect(page).toHaveURL(/\/city\/warszawa\/line\/M/)
})

test('linia: przełącznik kierunku odwraca początek i koniec trasy', async ({ page }) => {
  await page.goto('/city/warszawa/line/20')
  // Nagłówek „Trasa linii" (nie „Linia 20" — to osobny tytuł karty w PageAside)
  // renderuje się na każdym viewporcie.
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })

  const directionButton = page.getByRole('button', { name: 'Zmień kierunek' })
  const before = await directionButton.textContent()

  await directionButton.click()
  await expect(async () => {
    expect(await directionButton.textContent()).not.toBe(before)
  }).toPass({ timeout: 5_000 })
})

// Karta pogody żyje w PageAside (od `xl` po prawej, niżej pod treścią) albo
// w asideie osadzonym w gridzie (przystanek) — widoczna na każdym viewporcie.
const WEATHER_VIEWS = [
  { name: 'ekran miasta', path: '/city/warszawa' },
  { name: 'przeglądarka linii', path: '/city/warszawa/lines' },
  { name: 'szczegóły linii', path: '/city/warszawa/line/20' },
  { name: 'szczegóły przystanku', path: '/city/warszawa/stop/1001' },
]

for (const view of WEATHER_VIEWS) {
  test(`pogoda w kontekście miasta obecna na każdym ekranie GTFS: ${view.name}`, async ({ page }) => {
    await page.goto(view.path)
    await expect(page.getByRole('heading', { name: /Pogoda dziś/ })).toBeVisible({ timeout: READY })
  })
}
