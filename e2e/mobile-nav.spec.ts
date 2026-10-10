import { test, expect } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { openSearch } from './helpers/search'

// Telefon (poniżej `sm`; mobile-chromium/mobile-safari): nawigacja = dolny pasek „Nawigacja główna"
// (Start, Mapa, Szukaj, Linie — ADR 0010) + cienki nagłówek bez wyszukiwarki; pasek boczny jest
// `hidden sm:flex`. Na desktop-chromium jest odwrotnie — pasek boczny widoczny, dolnego paska nie ma.
const isMobile = (name: string) => name !== 'desktop-chromium'
const TARGETS: { name: string; role: 'link' | 'button' }[] = [
  { name: 'Start', role: 'link' },
  { name: 'Mapa', role: 'link' },
  { name: 'Szukaj', role: 'button' },
  { name: 'Linie', role: 'link' },
]

test('mobile: dolny pasek ma 4 cele (Start, Mapa, Szukaj, Linie) o polu >= 44×44, a „Start" jest bieżący na /', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dolny pasek tylko poniżej sm')

  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('listitem')).toHaveCount(4)
  for (const { name, role } of TARGETS) {
    const box = await nav.getByRole(role, { name }).boundingBox()
    expect(box?.width, `${name}: szerokość`).toBeGreaterThanOrEqual(44)
    expect(box?.height, `${name}: wysokość`).toBeGreaterThanOrEqual(44)
  }
  await expect(nav.getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page')
})

test('mobile: „Szukaj" w dolnym pasku otwiera okno wyszukiwania, a w nagłówku nie ma drugiego „Szukaj"', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dolny pasek tylko poniżej sm')

  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Szukaj' })).toHaveCount(0)
  await openSearch(page, testInfo.project.name)
})

test('mobile: tap w „Linie" przechodzi na listę linii i oznacza zakładkę jako bieżącą', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dolny pasek tylko poniżej sm')

  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' })
  await nav.getByRole('link', { name: 'Linie' }).click()
  await expect(page).toHaveURL(/\/city\/[^/]+\/lines/)
  await expect(nav.getByRole('link', { name: 'Linie' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Start' })).not.toHaveAttribute('aria-current', 'page')
})

// Jedna nazwa i jeden powrót na ekran telefonu (nagłówek nie dubluje h1, TopBar chowa się na telefonie).
for (const path of ['/', '/station/33605?name=Warszawa%20Centralna', '/city/warszawa/stop/1001']) {
  test(`mobile: dokładnie jeden widoczny h1 i najwyżej jedno „Wróć…": ${path}`, async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), 'układ telefonu')

    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 45_000 })
    const back = page.getByRole('link', { name: /^Wróć/ }).or(page.getByRole('button', { name: /^Wróć/ }))
    expect(await back.count()).toBeLessThanOrEqual(1)
  })
}

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
  // Desktop zachowuje własne menu: „Start" i „Odjazdy / Przyjazdy" (telefon ma inny zestaw).
  await expect(page.getByRole('link', { name: 'Start', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Odjazdy / Przyjazdy', exact: true })).toBeVisible()
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
  await openSearch(page, testInfo.project.name)

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
