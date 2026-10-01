import { test, expect, type Locator } from '@playwright/test'

// Niewidoczny obszar trafienia 44×44 (`touch-44`, WCAG 2.5.5) — wygląd bez zmian,
// więc mierzymy `::after`, nie sam przycisk. Decyzja właściciela 2026-09-29.
const READY = 45_000

async function afterSize(el: Locator) {
  return el.evaluate((node) => {
    const s = getComputedStyle(node, '::after')
    return { w: parseFloat(s.width), h: parseFloat(s.height) }
  })
}

test('IconButton (przypnij na tablicy stacji) ma obszar trafienia >= 44×44, a wygląd 36 px', async ({ page }) => {
  await page.goto('/station/33605?name=Warszawa%20Centralna')
  const pin = page.getByRole('button', { name: 'Przypnij do Pulpitu' })
  await expect(pin).toBeVisible()
  const { w, h } = await afterSize(pin)
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
  const box = await pin.boundingBox()
  expect(box?.width).toBe(36)
})

test('hamburger (mobile) ma obszar trafienia >= 44×44', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'hamburger tylko poniżej sm')
  await page.goto('/')
  const { w, h } = await afterSize(page.getByRole('button', { name: /otwórz menu/i }))
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
})

test('„Powiększ mapę" zostaje w rogu mapy i ma obszar trafienia >= 44×44', async ({ page }) => {
  await page.goto('/city/warszawa/stop/1001')
  await expect(page.getByRole('region', { name: /^Mapa (zespołu przystanków|przystanku)/ })).toBeVisible({ timeout: READY })
  const btn = page.getByRole('button', { name: 'Powiększ mapę' })
  const { w, h } = await afterSize(btn)
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
  expect(await btn.evaluate((n) => getComputedStyle(n).position)).toBe('absolute')
})

test('minuty w rozkładzie linii mają >= 24×24 px (WCAG 2.5.8)', async ({ page }) => {
  await page.goto('/city/warszawa/line/20')
  const minute = page.getByRole('button', { pressed: false }).filter({ hasText: /^\d\d~?$/ }).first()
  await expect(minute).toBeVisible({ timeout: READY })
  const box = await minute.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(24)
  expect(box?.height).toBeGreaterThanOrEqual(24)
})

test('link „Wróć do Pulpitu” w TopBarze ma obszar trafienia >= 44×44', async ({ page }) => {
  await page.goto('/station/33605?name=Warszawa%20Centralna')
  const { w, h } = await afterSize(page.getByRole('link', { name: 'Wróć do Pulpitu' }))
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
})

test('przełącznik paska bocznego (desktop) ma obszar trafienia >= 44×44', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'pasek boczny tylko od sm')
  await page.goto('/')
  const { w, h } = await afterSize(page.getByRole('button', { name: /pasek boczny/ }))
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
})
