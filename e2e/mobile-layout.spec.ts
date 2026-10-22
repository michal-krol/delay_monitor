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

// Wyniki wyszukiwania z długą nazwą linii i wieloma plakietkami nie poszerzają strony (320 i 375 px).
for (const width of [320, 375]) {
  test(`/search na ${width} px: wyniki trzech grup bez poziomego przewijania`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/search?q=Centr')
    const main = page.getByRole('main')
    for (const heading of ['Stacje kolejowe', 'Przystanki', 'Linie']) await expect(main.getByRole('heading', { name: heading })).toBeVisible({ timeout: 45_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
}

test('pulpit na 375 px: statystyki pod treścią, zwinięte, bez arkusza Info', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pkp.installDismissed.v1', JSON.stringify({ dismissedAt: Date.now() })))
  await page.goto('/')
  const stats = page.getByRole('button', { name: /Dziś w Polsce/ })
  await expect(stats).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Info', exact: true })).toHaveCount(0)
  await stats.click()
  await expect(stats).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('region', { name: 'Statystyki sieci kolejowej' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Informacje o sieci' })).toHaveCount(0)
})

// Start (PR11): na 320 i 375 px wejście do szukania, okolica i początek „Moje miejsca” bez poziomego przewijania.
const START_PINS = [
  { kind: 'pkp', id: '33605', name: 'Warszawa Centralna z bardzo długą nazwą testową dla zawijania' },
  { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' },
]
for (const width of [320, 375]) {
  test(`start na ${width} px: wejście, okolica i „Moje miejsca” w pierwszym ekranie, bez poziomego przewijania`, async ({ page }) => {
    await page.addInitScript((value) => window.localStorage.setItem('monitor.favourites.v2', JSON.stringify(value)), START_PINS)
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')
    const main = page.getByRole('main')
    const barTop = (await page.getByRole('navigation', { name: 'Nawigacja główna' }).boundingBox())?.y ?? 812
    for (const locator of [main.getByRole('button', { name: 'Stacja, przystanek, linia lub pociąg' }), main.getByRole('button', { name: 'W pobliżu mnie' }), main.getByRole('heading', { name: 'Moje miejsca' })]) {
      await expect(locator).toBeVisible()
      const box = await locator.boundingBox()
      expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(barTop)
    }
    await expect(main.getByRole('article').first()).toBeVisible({ timeout: 45_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
}

test('linii na 375 px: karty „Trasa linii” i Rozkładu mają się zmieścić bez poziomego przewijania', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/city/warszawa/line/20')
  await expect(page.getByRole('heading', { level: 1, name: /Centrum – Dworzec Centralny/ })).toBeVisible()
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  // Poniżej `lg` jedna sekcja naraz (PR4): „Trasa”, potem „Rozkład” z przełącznika.
  await expect(page.getByRole('heading', { name: /^Trasa linii/ })).toBeVisible()
  expect(await overflow()).toBeLessThanOrEqual(0)
  await page.getByRole('group', { name: 'Widok linii' }).getByRole('button', { name: 'Rozkład' }).click()
  await expect(page.getByRole('heading', { name: /^Rozkład/ })).toBeVisible()
  expect(await overflow()).toBeLessThanOrEqual(0)
})
