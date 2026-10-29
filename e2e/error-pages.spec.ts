import { test, expect } from '@playwright/test'
import { scanA11y } from './helpers/axe'

// 404 i granica błędu: smoke (desktop + telefon, projekty z `playwright.config.ts`) + axe w obu motywach.
const BLOCKING = ['serious', 'critical']

async function expectNoBlockingViolations(page: import('@playwright/test').Page): Promise<void> {
  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`404 (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
    })

    test('nieznany adres: status 404, polski komunikat, powrót do Pulpitu, bez naruszeń axe', async ({ page }) => {
      const response = await page.goto('/ta-strona-nie-istnieje')
      expect(response?.status()).toBe(404)
      await expect(page.getByRole('heading', { level: 1, name: 'Nie znaleziono strony' })).toBeVisible()
      await expect(page).toHaveTitle(/.+/)
      await expectNoBlockingViolations(page)

      await page.getByRole('link', { name: 'Wróć do Startu' }).click()
      await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible()
    })

    test('zły identyfikator stacji (notFound() ze strony): ten sam komunikat w ramce z nawigacją, noindex, bez naruszeń axe', async ({ page }) => {
      await page.goto('/station/abc')
      // Strona kliencka: powłoka jest już wysłana ze statusem 200, więc Next oznacza ją `noindex`
      // zamiast zwracać 404 — roboty i tak jej nie indeksują.
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
      await expect(page.getByRole('heading', { level: 1, name: 'Nie znaleziono strony' })).toBeVisible()
      await expect(page.getByRole('navigation').first()).toBeAttached()
      await expectNoBlockingViolations(page)
    })
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`granica błędu (${theme}): wyjątek przy renderze pokazuje polski komunikat bez surowego tekstu, bez naruszeń axe`, async ({ page }) => {
    await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
    // BoardTable formatuje godziny przez formatClockTime → Date#toLocaleTimeString po otrzymaniu danych.
    // Ten render leży wewnątrz granicy (app); metadane HeaderData w chrome używają osobnego toLocaleString.
    await page.addInitScript(() => {
      const original = Date.prototype.toLocaleTimeString
      ;(window as unknown as { __restoreRenderTimeFormatting: () => void }).__restoreRenderTimeFormatting = () => {
        Date.prototype.toLocaleTimeString = original
      }
      Date.prototype.toLocaleTimeString = () => {
        throw new Error('SEKRETNY-KOMUNIKAT-BLEDU')
      }
    })
    await page.goto('/station/33605?name=Warszawa%20Centralna')

    await expect(page.getByRole('heading', { level: 1, name: 'Nie udało się wczytać tej strony' })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText('SEKRETNY-KOMUNIKAT-BLEDU')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Wróć do Startu' })).toHaveAttribute('href', '/')
    await expectNoBlockingViolations(page)
    await page.evaluate(() => (window as unknown as { __restoreRenderTimeFormatting: () => void }).__restoreRenderTimeFormatting())
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Warszawa Centralna' })).toBeVisible()
    await expect(page.locator('td button[aria-label]').first()).toBeVisible()
    await expect(page.getByText('SEKRETNY-KOMUNIKAT-BLEDU')).toHaveCount(0)
  })
}

test('robots.txt blokuje /api/, sitemap.xml jest poprawnym XML-em z miastami i stacjami', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  const robotsText = await robots.text()
  expect(robotsText).toMatch(/User-Agent: \*/i)
  expect(robotsText).toMatch(/Disallow: \/api\//)

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()['content-type']).toContain('xml')
  const xml = await sitemap.text()
  expect(xml).toContain('<urlset')
  expect(xml).toContain('/city/warszawa/lines</loc>')
  expect(xml).toContain('/station/33605</loc>')
})

test('/city bez segmentu: szkielet zamiast gołego „Wybieram miasto…”, potem ekran miasta', async ({ page }) => {
  await page.goto('/city')
  await expect(page.getByText('Wybieram miasto…')).toHaveCount(0)
  await expect(page).toHaveURL(/\/city\/warszawa$/, { timeout: 15_000 })
})
