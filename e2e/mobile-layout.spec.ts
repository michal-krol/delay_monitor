import { test, expect } from '@playwright/test'

// PR 8 Task 4 (C9, C14): prawa kolumna wchodzi pod treść poniżej `xl`, a wiersz
// odjazdu mieści się na 375 px nawet z pełnym zestawem oznaczeń.

test.use({ viewport: { width: 375, height: 800 } })

test('wiersz odjazdu na 375 px: bez poziomego przewijania, nagłówek kursu widoczny', async ({ page }) => {
  // Wymuszamy „na żądanie" na każdym odjeździe — najgorszy przypadek (peron + plakietka + „za …").
  await page.route('**/api/gtfs/board**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const stop of body.stops ?? []) {
      for (const d of stop.departures ?? []) d.onRequest = true
    }
    await route.fulfill({ response, json: body })
  })

  // Cały zespół (`1001`), nie przystanek (`100101`): deep-link na przystanek pobiera najpierw
  // listę zespołu, a potem drugi raz zawężoną do przystanku (`requestedMember` → `?member=`).
  // Gdy pierwszy odjazd obu list się różni (zależy od godziny), React podmienia `<li>`
  // w trakcie pomiaru i `boundingBox()` dostaje odpięty węzeł → `null` → szerokość 0
  // (flaky 2026-10-01). Zespół = jedno źródło listy, bez podmiany, a do tego najpełniejszy
  // zestaw oznaczeń: numer przystanku („Odjazd z przystanku 01") + peron + plakietka + „za …".
  await page.goto('/city/warszawa/stop/1001')
  const row = page.getByTestId('departure-list').locator('li').first()
  await expect(row).toBeVisible({ timeout: 45_000 })
  await expect(row).toContainText('na żądanie')
  await expect(row).toContainText('Odjazd z przystanku')

  const { scrollWidth, clientWidth } = await row.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

  const headsign = row.getByTestId('departure-headsign')
  await expect(headsign).toBeVisible()
  const box = await headsign.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(40)
})

test('pulpit na 375 px: karta „Dziś w Polsce" jest widoczna pod treścią', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Dziś w Polsce/ })).toBeVisible()
})

test('linii na 375 px: karty „Trasa linii” i Rozkładu mają się zmieścić bez poziomego przewijania', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/city/warszawa/line/20')
  await expect(page.getByRole('heading', { level: 1, name: /Centrum – Dworzec Centralny/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Rozkład/ })).toBeVisible()

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
