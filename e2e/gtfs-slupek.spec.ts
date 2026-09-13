import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Mock „Centrum" (zespół 1001) = 4 słupki z RÓŻNYMI liniami: 100101→20,
// 100102→128/N16, 100103→S2, 100104 (peron 04, wheelchair=2). AGENTS.md #13.
const CENTRUM = '/city/warszawa/stop/1001'

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s) — strona sama
// ponawia, więc czekamy z zapasem na pierwszą treść z rozkładu.
const READY = 45_000

test('przystanek miejski: przełącznik słupków zespołu', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()

  const switcher = page.getByText('Słupki tego przystanku', { exact: false })
  await expect(switcher).toBeVisible({ timeout: READY })

  // „Cały przystanek" + jeden przycisk na słupek, konwencja WTP „Centrum 02".
  await expect(page.getByRole('tab', { name: /Cały przystanek/ })).toBeVisible()
  const slupek02 = page.getByRole('tab', { name: /^Centrum 02/ })
  await expect(slupek02).toBeVisible()

  // Wybór słupka: nagłówek dostaje podtytuł, tab jest zaznaczony.
  await slupek02.click()
  await expect(slupek02).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText(/^Centrum 02/).first()).toBeVisible()

  // Powrót do całego zespołu — odjazdy tagowane numerem słupka.
  await page.getByRole('tab', { name: /Cały przystanek/ }).click()
  await expect(page.getByText(/^0\d$/).first()).toBeVisible({ timeout: READY })

  // Widżet pogody w kontekście miasta obecny na każdym ekranie GTFS (#5 / to ważne).
  await expect(page.getByRole('heading', { name: /Pogoda dziś/ })).toBeVisible()
})

test('przystanek miejski: deep-link słupka od razu go podświetla', async ({ page }) => {
  await page.goto('/city/warszawa/stop/100101')
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: /^Centrum 01/ })).toHaveAttribute('aria-selected', 'true', {
    timeout: READY,
  })
})

test('słupek metra z dwukropkiem w ID: link z linii prowadzi do tablicy, nie 404', async ({ page }) => {
  // Regresja: `7014M:P1` (peron metra, AGENTS.md #13) — `:` w GTFS stop ID
  // gubi się w hydracji dynamicznego segmentu Next.js przy przejściu klientem
  // (klik linku, nie `page.goto` gotowego URL-a — inaczej test nie łapie tego,
  // co łapie prawdziwy routing). Musi zadziałać przez klik ORAZ po twardym
  // przeładowaniu tego samego URL-a (`decodeStopIdFromPathSegment`).
  await page.goto('/city/warszawa/line/M1')
  const link = page.getByRole('link', { name: /pełna tablica słupka/ })
  await expect(link).toBeVisible({ timeout: READY })

  await link.click()
  await expect(page).not.toHaveTitle(/404/)
  await expect(page.getByRole('heading', { name: 'Świętokrzyska', exact: true })).toBeVisible({ timeout: READY })

  await page.reload()
  await expect(page).not.toHaveTitle(/404/)
  await expect(page.getByRole('heading', { name: 'Świętokrzyska', exact: true })).toBeVisible({ timeout: READY })
})

test('a11y: szczegóły przystanku miejskiego bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByText('Słupki tego przystanku', { exact: false })).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
