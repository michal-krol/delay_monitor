import { test, expect } from '@playwright/test'
import { openPageOptions, changeTheme } from './helpers/page-options'
import { scanA11y } from './helpers/axe'

test('opcje i motyw zachowują scroll, resize nie wraca na górę', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/city/warszawa/line/20')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => window.scrollTo(0, 300))
  const before = await page.evaluate(() => scrollY)
  expect(before).toBeGreaterThan(0)
  await openPageOptions(page)
  expect(await page.evaluate(() => scrollY)).toBe(before)
  await changeTheme(page, 'Przełącz na tryb ciemny')
  expect(await page.evaluate(() => scrollY)).toBe(before)
  await page.setViewportSize({ width: 390, height: 812 })
  // Reflow changes line wrapping: Chromium anchors this view at 269px, WebKit keeps 300px. Neither resets to the top.
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
})

test('macierz powłoki: sześć szerokości i oba motywy bez nowych żądań kontekstu', async ({ page }) => {
  const calls: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (/^\/api\/(weather|cities|board|gtfs)/.test(path)) calls.push(path)
  })
  await page.goto('/city/warszawa?station=33605&name=Warszawa%20Centralna')
  await expect(page.getByRole('heading', { name: 'Warszawa Centralna', exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('button', { name: /^Pogoda:.*°C/ }).filter({ visible: true })).toHaveCount(1)
  await page.waitForLoadState('networkidle')
  const counts = [...calls]
  expect(counts.filter((path) => path === '/api/weather')).toHaveLength(1)
  const url = new URL(page.url()).search
  for (const width of [320, 375, 390, 430, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['ciemny', 'jasny']) {
      await changeTheme(page, `Przełącz na tryb ${theme}`)
      await expect(page.getByRole('button', { name: 'Więcej opcji strony' }).filter({ visible: true })).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    }
  }
  expect(calls).toEqual(counts)
  expect(new URL(page.url()).search).toBe(url)
})

for (const [place, path] of [['stacja', '/station/33605?name=Warszawa%20Centralna'], ['mapa miasta', '/city/warszawa/map']] as const) {
  test(`pogoda miejsca w topbarze obu układów: ${place}`, async ({ page }) => {
    let calls = 0
    page.on('request', (request) => { if (request.url().includes('/api/weather?')) calls++ })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    const chip = () => page.getByRole('button', { name: /^Pogoda:.*°C/ }).filter({ visible: true })
    await expect(chip()).toHaveCount(1)
    await expect(chip()).toBeVisible()
    expect(calls).toBe(1)
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(chip()).toHaveCount(1)
    await expect(chip()).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(chip()).toHaveCount(1)
    await expect(chip()).toBeVisible()
    expect(calls).toBe(1)
  })
}

test('powłoka współdzieli pogodę; motyw, szerokość i szczegóły nie pobierają jej ponownie', async ({ page }) => {
  const weatherCalls: string[] = []
  page.on('request', (request) => { if (request.url().includes('/api/weather?')) weatherCalls.push(request.url()) })
  await page.goto('/city/warszawa')
  const chip = () => page.getByRole('button', { name: /^Pogoda:.*°C/ }).filter({ visible: true })
  await expect(chip()).toBeVisible({ timeout: 45_000 })
  expect(weatherCalls).toHaveLength(1)
  const original = new URL(page.url()).search
  await chip().click()
  await expect(page.getByRole('dialog', { name: /Pogoda dziś/ }).or(page.getByRole('region', { name: /Pogoda dziś/ }))).toBeVisible()
  await page.keyboard.press('Escape')
  await changeTheme(page, 'Przełącz na tryb ciemny')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(chip()).toBeVisible()
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(chip()).toBeVisible()
  expect(weatherCalls).toHaveLength(1)
  expect(new URL(page.url()).search).toBe(original)
  const menu = await openPageOptions(page)
  await menu.getByRole('button', { name: 'Źródła danych' }).click()
  await expect(page.getByRole('dialog', { name: 'Źródła danych', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('dialog', { name: 'Źródła danych', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Więcej opcji strony' }).filter({ visible: true })).toBeFocused()
  expect(weatherCalls).toHaveLength(1)
})

test('Źródła danych: rozwinięcia, Escape i fokus w obu układach oraz motywach', async ({ page }) => {
  await page.goto('/station/33605?name=Warszawa%20Centralna')
  await expect(page.getByRole('heading', { level: 1, name: 'Warszawa Centralna' })).toBeVisible({ timeout: 45_000 })
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await changeTheme(page, 'Przełącz na tryb ciemny')
    const menu = await openPageOptions(page)
    await menu.getByRole('button', { name: 'Źródła danych' }).click()
    const dialog = page.getByRole('dialog', { name: 'Źródła danych', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByText('Komunikacja miejska — GTFS', { exact: true }).click()
    await expect(dialog.getByText(/nie określają punktualności/)).toBeVisible()
    await expect(dialog.getByText('PKP Polskie Linie Kolejowe', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Open-Meteo — pogoda', { exact: true })).toBeVisible()
    expect((await scanA11y(page)).violations).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Więcej opcji strony' }).filter({ visible: true })).toBeFocused()
  }
})

test('320 px i tekst 200%: nagłówek rośnie, jego offset zgadza się z wysokością', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 })
  await page.goto('/station/33605?name=Warszawa%20Centralna')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  const header = page.getByRole('banner').filter({ visible: true })
  await expect(header).toBeVisible()
  await expect.poll(() => header.evaluate((element) => Math.abs(element.getBoundingClientRect().height - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'))))).toBeLessThan(1)
  const box = (await header.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  for (const control of await header.getByRole('button').or(header.getByRole('link')).all()) {
    const rect = (await control.boundingBox())!
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(320)
  }
  await openPageOptions(page)
  const options = page.getByRole('list', { name: 'Więcej', exact: true }).filter({ visible: true })
  const menuBox = (await options.boundingBox())!
  expect(menuBox.x).toBeGreaterThanOrEqual(0)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(320)
})
