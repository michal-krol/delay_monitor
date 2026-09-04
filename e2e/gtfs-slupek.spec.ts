import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Mock „Centrum" (zespół 1001) = 4 słupki z RÓŻNYMI liniami: 100101→20,
// 100102→128/N16, 100103→S2, 100104 (peron 04, wheelchair=2). AGENTS.md #13.
const CENTRUM = '/miasto/warszawa/przystanek/1001'

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s) — strona sama
// ponawia, więc czekamy z zapasem na pierwszą treść z rozkładu.
const READY = 45_000

test('przystanek miejski: przełącznik słupków zespołu', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()

  const switcher = page.getByText('Słupki tego przystanku', { exact: false })
  await expect(switcher).toBeVisible({ timeout: READY })

  // „Cały przystanek" + jeden przycisk na słupek, konwencja WTP „Centrum 02".
  await expect(page.getByRole('button', { name: /Cały przystanek/ })).toBeVisible()
  const slupek02 = page.getByRole('button', { name: /^Centrum 02/ })
  await expect(slupek02).toBeVisible()

  // Wybór słupka: nagłówek dostaje podtytuł, przycisk jest wciśnięty.
  await slupek02.click()
  await expect(slupek02).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^Centrum 02/).first()).toBeVisible()

  // Powrót do całego zespołu — odjazdy tagowane numerem słupka.
  await page.getByRole('button', { name: /Cały przystanek/ }).click()
  await expect(page.getByText(/^0\d$/).first()).toBeVisible({ timeout: READY })

  // Widżet pogody w kontekście miasta obecny na każdym ekranie GTFS (#5 / to ważne).
  await expect(page.getByRole('heading', { name: /Pogoda dziś/ })).toBeVisible()
})

test('przystanek miejski: deep-link słupka od razu go podświetla', async ({ page }) => {
  await page.goto('/miasto/warszawa/przystanek/100101')
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Centrum 01/ })).toHaveAttribute('aria-pressed', 'true', {
    timeout: READY,
  })
})

test('a11y: szczegóły przystanku miejskiego bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByText('Słupki tego przystanku', { exact: false })).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
