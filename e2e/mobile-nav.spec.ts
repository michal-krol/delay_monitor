import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Telefon (poniżej `sm`; mobile-chromium/mobile-safari): nawigacja = dolny pasek zakładek
// „Nawigacja główna" + cienki nagłówek; pasek boczny jest `hidden sm:flex`. Na desktop-chromium
// jest odwrotnie — pasek boczny widoczny, dolnego paska nie ma.
const isMobile = (name: string) => name !== 'desktop-chromium'
const TABS = ['Pulpit', 'Odjazdy', 'Linie', 'Mapa']

test('mobile: dolny pasek ma 4 zakładki o polu >= 44×44, a „Pulpit" jest bieżący na /', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dolny pasek tylko poniżej sm')

  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' })
  await expect(nav).toBeVisible()
  const links = nav.getByRole('link')
  await expect(links).toHaveCount(4)
  for (const name of TABS) {
    const box = await nav.getByRole('link', { name }).boundingBox()
    expect(box?.width, `${name}: szerokość`).toBeGreaterThanOrEqual(44)
    expect(box?.height, `${name}: wysokość`).toBeGreaterThanOrEqual(44)
  }
  await expect(nav.getByRole('link', { name: 'Pulpit' })).toHaveAttribute('aria-current', 'page')
})

test('mobile: tap w „Linie" przechodzi na listę linii i oznacza zakładkę jako bieżącą', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dolny pasek tylko poniżej sm')

  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' })
  await nav.getByRole('link', { name: 'Linie' }).click()
  await expect(page).toHaveURL(/\/city\/[^/]+\/lines/)
  await expect(nav.getByRole('link', { name: 'Linie' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Pulpit' })).not.toHaveAttribute('aria-current', 'page')
})

test('mobile: nie ma hamburgera ani szuflady, a desktopowy pasek boczny jest schowany', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dotyczy tylko mobile')

  await page.goto('/')
  await expect(page.getByRole('button', { name: /otwórz menu/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /zwiń pasek boczny|rozwiń pasek boczny/i })).not.toBeVisible()
})

test('desktop: dolny pasek zakładek nie jest widoczny, pasek boczny tak', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo.project.name), 'dotyczy tylko desktopu')

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Nawigacja główna' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: /zwiń pasek boczny|rozwiń pasek boczny/i })).toBeVisible()
})

test.describe('320×640', () => {
  test.use({ viewport: { width: 320, height: 640 } })

  for (const path of ['/', '/station/33605?name=Warszawa%20Centralna', '/city/warszawa/stop/1001']) {
    test(`bez poziomego przewijania: ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    })
  }
})

test('mobile: fokus na ostatnim linku długiej strony nie chowa się pod dolnym paskiem', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dolny pasek tylko poniżej sm')

  await page.goto('/city/warszawa/lines')
  await expect(page.getByTestId('line-section').first()).toBeVisible({ timeout: 45_000 })
  const navHeight = await page.getByRole('navigation', { name: 'Nawigacja główna' }).evaluate((n) => n.getBoundingClientRect().height)
  // Ostatni link w treści (poza paskiem i nagłówkiem), czyli to, co klawiatura osiąga na samym dole.
  const last = page.locator('main a, footer a').last()
  await last.focus()
  const bottom = await last.evaluate((n) => n.getBoundingClientRect().bottom)
  const viewport = page.viewportSize()
  expect(bottom).toBeLessThanOrEqual((viewport?.height ?? 0) - navHeight + 1)
})

test('a11y: otwarte okno wyszukiwania bez naruszeń serious/critical', async ({ page }, testInfo) => {
  await page.goto('/')
  if (isMobile(testInfo.project.name)) await page.getByRole('button', { name: 'Szukaj' }).click()
  else await page.keyboard.press('Control+K')
  await expect(page.getByRole('dialog', { name: 'Szukaj stacji lub przystanku' })).toBeVisible()

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
