import { test, expect } from '@playwright/test'

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s) — strony
// same ponawiają, więc czekamy z zapasem na pierwszą treść z rozkładu.
const READY = 45_000

test('ekran miasta: deep-link ?przystanek= renderuje osadzoną tablicę, „wróć" ją czyści', async ({ page }) => {
  await page.goto('/miasto/warszawa?przystanek=1001&nazwa=Centrum')

  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible({ timeout: READY })
  // KPI zespołu chowane, gdy panel szczegółów jest otwarty.
  await expect(page.getByText('przystanki miejskie')).not.toBeVisible()

  await page.getByRole('button', { name: /Wróć do wyszukiwania/ }).click()
  await expect(page).toHaveURL(/\/miasto\/warszawa$/)
  await expect(page.getByText('przystanki miejskie')).toBeVisible()
})

test('przeglądarka linii: filtr rodzaju zawęża siatkę do metra', async ({ page }) => {
  await page.goto('/miasto/warszawa/linie')
  await expect(page.getByRole('link', { name: /^Linia / }).first()).toBeVisible({ timeout: READY })

  const filter = page.getByRole('group', { name: 'Filtr rodzaju transportu' })
  await expect(filter.getByRole('button', { name: /tramwaj/i })).toBeVisible()

  const metroChip = filter.getByRole('button', { name: /^metro/i })
  await metroChip.click()
  await expect(metroChip).toHaveAttribute('aria-pressed', 'true')

  await expect(page.getByRole('heading', { name: /^metro ·/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^tramwaj ·/ })).not.toBeVisible()

  await page.getByRole('link', { name: /^Linia M/ }).first().click()
  await expect(page).toHaveURL(/\/miasto\/warszawa\/linia\/M/)
})

test('linia: przełącznik kierunku odwraca początek i koniec trasy', async ({ page }) => {
  await page.goto('/miasto/warszawa/linia/20')
  // Nagłówek „Trasa linii" (nie „Linia 20" — to osobny tytuł karty w PageAside,
  // schowanej na mobile) renderuje się na każdym viewporcie.
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })

  const directionButton = page.getByRole('button', { name: 'Zmień kierunek' })
  const before = await directionButton.textContent()

  await directionButton.click()
  await expect(async () => {
    expect(await directionButton.textContent()).not.toBe(before)
  }).toPass({ timeout: 5_000 })
})

// „ekran miasta"/„przeglądarka linii"/„szczegóły linii" trzymają kartę pogody
// w PageAside — `hidden ... xl:flex`, wyłącznie desktop. „szczegóły przystanku"
// (TransitStopDetail) osadza swój aside wprost w gridzie — widoczny na każdym
// viewporcie, więc jedyny bez desktop-gate.
const WEATHER_VIEWS = [
  { name: 'ekran miasta', path: '/miasto/warszawa', desktopOnly: true },
  { name: 'przeglądarka linii', path: '/miasto/warszawa/linie', desktopOnly: true },
  { name: 'szczegóły linii', path: '/miasto/warszawa/linia/20', desktopOnly: true },
  { name: 'szczegóły przystanku', path: '/miasto/warszawa/przystanek/1001', desktopOnly: false },
]

for (const view of WEATHER_VIEWS) {
  test(`pogoda w kontekście miasta obecna na każdym ekranie GTFS: ${view.name}`, async ({ page }, testInfo) => {
    if (view.desktopOnly && testInfo.project.name !== 'desktop-chromium') {
      test.skip()
    }
    await page.goto(view.path)
    await expect(page.getByRole('heading', { name: /Pogoda dziś/ })).toBeVisible({ timeout: READY })
  })
}
