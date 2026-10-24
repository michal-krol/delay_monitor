import { test, expect } from './helpers/test'
import { scanA11y } from './helpers/axe'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test('line statistics keep both complete directions and compact fleet through responsive layout', async ({ page }, testInfo) => {
  const requests = new Map<string, number[]>()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/gtfs/vehicles') return
    const directionId = url.searchParams.get('direction') ?? ''
    requests.set(directionId, [...(requests.get(directionId) ?? []), Date.now()])
  })
  await page.goto('/city/warszawa/line/20')
  const panel = page.getByRole('region', { name: 'Statystyki linii' })
  await expect(panel).toBeVisible({ timeout: 45_000 })
  await expect(panel.getByRole('heading', { level: 3 })).toHaveCount(2)
  await expect(panel.getByText('#3801', { exact: true })).toBeVisible()
  await expect(panel.getByText(/przystank.*na żądanie/)).toHaveCount(2)
  await expect(panel.getByRole('listitem').filter({ hasText: '#3801' })).toHaveCount(1)
  const direction = page.getByRole('heading', { name: /Trasa linii/ })
  const counts = await panel.getByText(/przystank.*na żądanie/).allTextContents()
  const captureDir = path.join(process.cwd(), 'docs', 'ui0709')
  await mkdir(captureDir, { recursive: true })
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(panel).toHaveCount(1)
    await expect(panel.getByText(/przystank.*na żądanie/)).toHaveText(counts)
    const routeBox = await direction.boundingBox()
    const panelBox = await panel.boundingBox()
    expect(routeBox).not.toBeNull()
    expect(panelBox).not.toBeNull()
    if (width === 320) expect(panelBox!.y).toBeGreaterThan(routeBox!.y)
    else expect(panelBox!.x).toBeGreaterThan(routeBox!.x)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme))
      await expect(panel).toHaveCount(1)
      await panel.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(captureDir, `line-statistics-${testInfo.project.name}-${width}-${colorScheme}.png`), fullPage: true })
    }
  }
  expect([...requests.keys()].sort()).toEqual(['0', '1'])
  // Scheduled 20 s refreshes may occur during captures; a resize/theme remount would add an immediate request.
  for (const times of requests.values()) {
    for (let index = 1; index < times.length; index++) expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(19_000)
  }
  const accessibility = await scanA11y(page)
  expect(accessibility.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
})

test('failed positions stay unknown for both directions while the line route remains usable', async ({ page }) => {
  await page.route('**/api/gtfs/vehicles?**', (route) => route.fulfill({ json: { vehicles: [], feed: { state: 'failed', ageMs: null } } }))
  await page.goto('/city/warszawa/line/20')
  const panel = page.getByRole('region', { name: 'Statystyki linii' })
  await expect(panel.getByText('Nie udało się pobrać pozycji.')).toHaveCount(2, { timeout: 45_000 })
  await expect(panel.getByRole('heading', { name: 'Pojazdy w trasie: 0' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible()
  await page.getByRole('button', { name: 'Zmień kierunek' }).click()
  await expect(page).toHaveURL(/dir=1/)
})

test('an initialized line map clips absolute markers after a slow desktop to phone resize', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP CPU throttling is Chromium-only')
  await page.setViewportSize({ width: 1440, height: 900 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  await page.goto('/city/warszawa/line/20')
  const map = page.getByRole('region', { name: 'Mapa trasy linii 20', exact: true })
  await map.scrollIntoViewIfNeeded()
  await expect(map).toHaveClass(/maplibregl-map/, { timeout: 45_000 })
  await page.setViewportSize({ width: 320, height: 900 })
  await expect(map).toHaveClass(/h-44/)
  expect(await map.evaluate((node) => getComputedStyle(node).position)).toBe('relative')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Powiększ mapę', exact: true }).click()
  const fullscreen = page.getByRole('dialog', { name: 'Mapa trasy linii 20', exact: true })
  await expect(fullscreen).toBeVisible()
  expect((await fullscreen.boundingBox())!.width).toBeGreaterThan(270)
  await page.getByRole('button', { name: 'Zamknij powiększoną mapę', exact: true }).click()
  await expect(fullscreen).toHaveCount(0)
})
