import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Strona „Linie”: zwijane sekcje (natywne <details>), szukanie, „Ostatnio oglądane”.
// Mock GTFS ma ~7 linii (fixtures/gtfs/warszawa): metro M1/M2, tramwaj 20, autobusy 128/521/N16, kolej S2.
// Na wąskim ekranie wszystkie sekcje startują zwinięte, na szerokim te do 30 linii otwarte —
// testy nie zakładają stanu domyślnego, tylko go czytają albo rozwijają wszystko.
const READY = 45_000
const BLOCKING = ['serious', 'critical']

async function gotoLines(page: Page) {
  await page.goto('/city/warszawa/lines')
  await expect(page.getByRole('heading', { level: 1, name: 'Linie — Warszawa' })).toBeVisible()
  await expect(page.getByTestId('line-section').first()).toBeVisible({ timeout: READY })
}

async function expandAll(page: Page) {
  for (const testId of ['line-section', 'line-subsection']) {
    // sekcje przed podsekcjami: podsekcja w zwiniętej sekcji jest niewidoczna, klik by zawisł
    const items = page.getByTestId(testId)
    for (let i = 0; i < (await items.count()); i++) {
      const item = items.nth(i)
      if (!(await item.evaluate((node) => (node as HTMLDetailsElement).open))) await item.locator('summary').first().click()
    }
  }
}

test('sekcja zwinięta/rozwinięta przez użytkownika przeżywa odświeżenie strony', async ({ page }) => {
  await gotoLines(page)
  const metro = page.getByTestId('line-section').first()
  const before = await metro.evaluate((node) => (node as HTMLDetailsElement).open)
  await metro.locator('summary').click()
  await expect(metro).toHaveJSProperty('open', !before)

  await page.reload()
  await expect(page.getByTestId('line-section').first()).toBeVisible({ timeout: READY })
  await expect(page.getByTestId('line-section').first()).toHaveJSProperty('open', !before)
})

test('odwiedzona linia pojawia się w „Ostatnio oglądane”', async ({ page }) => {
  await gotoLines(page)
  await expect(page.getByRole('group', { name: 'Ostatnio oglądane' })).toHaveCount(0)

  await expandAll(page)
  await page.getByRole('link', { name: /^Linia M1: / }).click()
  await expect(page).toHaveURL(/\/city\/warszawa\/line\/M1/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })

  await gotoLines(page)
  const recent = page.getByRole('group', { name: 'Ostatnio oglądane' })
  await expect(recent.getByRole('link', { name: /^Linia M1: / })).toBeVisible()
})

test('szukanie: wynik z plakietką rodzaju, komunikat przy braku wyników', async ({ page }) => {
  await gotoLines(page)
  await page.getByLabel('Szukaj linii').fill('n16')
  const hit = page.getByRole('link', { name: /^Linia N16: / })
  await expect(hit).toBeVisible()
  await expect(hit).toContainText('nocna')
  await expect(page.getByTestId('line-section')).toHaveCount(0)

  await page.getByLabel('Szukaj linii').fill('zzzz')
  await expect(page.getByText('Brak linii pasujących do wyszukiwania.')).toBeVisible()
})

test('kafel linii ma cel dotyku co najmniej 44 px', async ({ page }) => {
  await gotoLines(page)
  await expandAll(page)
  const box = await page.getByRole('link', { name: /^Linia M1: / }).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
})

test('375 px: lista linii nie przewija strony w poziomie', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'pomiar clientWidth na desktop-chromium; mobile ma własny viewport')
  await page.setViewportSize({ width: 375, height: 812 })
  await gotoLines(page)
  await expandAll(page)
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(clientWidth).toBe(375)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a11y: lista linii (wszystkie sekcje rozwinięte) w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} bez naruszeń serious/critical`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    // „Ostatnio oglądane” też ma być w skanie.
    await page.addInitScript(() => window.localStorage.setItem('monitor.recentLines.v1', JSON.stringify({ warszawa: ['N16', 'M1'] })))
    await gotoLines(page)
    await expect(page.getByRole('group', { name: 'Ostatnio oglądane' })).toBeVisible()
    await expandAll(page)

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  })
}

test('a11y: wyniki szukania w trybie ciemnym bez naruszeń serious/critical', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await gotoLines(page)
  await page.getByLabel('Szukaj linii').fill('d')
  await expect(page.getByRole('heading', { level: 2, name: /^Wyniki/ })).toBeVisible()

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
