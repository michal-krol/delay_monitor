import { test, expect, type Page } from '@playwright/test'
import type { BoardApiRow } from '../src/hooks/useBoard'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

const destination = 'Krynica-Zdrój przez Warszawę Wschodnią i Nowy Sącz'
const train = 'IC 12345 Bardzo długa pełna nazwa pociągu dalekobieżnego'
const platform = '12 / tor 123'

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('monitor.favourites.v2', JSON.stringify([{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]))
    localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '80416', name: 'Kraków Główny' }]))
  })
  await page.route('**/api/board**', async (route) => {
    const now = Date.now()
    const departures: BoardApiRow[] = Array.from({ length: 3 }, (_, index) => ({
      scheduleId: `dashboard-${index}`, orderId: `test-${index}`, operatingDate: '2026-10-24',
      trainNumber: `${12345 + index}`, trainLabel: train, carrier: 'IC', carrierName: 'PKP Intercity',
      category: 'IC', categoryName: null, headsign: destination, platform,
      plannedAt: new Date(now + (index + 1) * 600_000).toISOString(), actualAt: null,
      delayMinutes: null, status: 'notStarted', estimatedDelayMinutes: null,
    }))
    await route.fulfill({ json: { snapshots: [{ stationId: '33605', stationName: 'Warszawa Centralna', departures, arrivals: [], fetchedAt: new Date(now).toISOString(), ageMs: 0 }], status: 'ok', throttled: false } })
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`dashboard full PKP names remain readable: ${theme}`, async ({ page }, testInfo) => {
    await prepare(page)
    let boardRequests = 0
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/board') boardRequests++ })
    await page.goto('/')
    const card = page.getByRole('article')
    await expect(card.getByRole('listitem')).toHaveCount(3)
    if (theme === 'dark') await changeTheme(page, 'Przełącz na tryb ciemny')
    for (const [width, textSize] of [[1280, '100%'], [1440, '100%'], [320, '100%'], [320, '200%']] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((size) => { document.documentElement.style.fontSize = size }, textSize)
      await page.screenshot({ path: `docs/pr11/${testInfo.project.name}-${theme}-${width}-${textSize}.png`, fullPage: true, animations: 'disabled' })
      const direction = card.getByText(destination, { exact: true }).first()
      await expect(direction).toBeVisible()
      const readableWidth = await direction.evaluate((element) => element.getBoundingClientRect().width / parseFloat(getComputedStyle(element).fontSize))
      expect(readableWidth, 'the full destination needs a readable column, not one letter per line').toBeGreaterThanOrEqual(6)
      // DOM text alone also passes when CSS clips it: verify the real rendered boxes.
      for (const text of [direction, card.getByText(`IC · ${train} · peron ${platform}`, { exact: true }).first()]) {
        const clipping = await text.evaluate((element) => {
          const style = getComputedStyle(element)
          return { nowrap: style.whiteSpace === 'nowrap', clipped: element.scrollWidth > element.clientWidth + 1 }
        })
        expect(clipping).toEqual({ nowrap: false, clipped: false })
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    }
    expect((await scanA11y(page)).violations).toEqual([])
    expect(boardRequests).toBe(1)
    await expect(card.getByRole('link', { name: new RegExp(destination) }).first()).toHaveAttribute('href', /\/connection\/dashboard-0\/test-0\/2026-10-24/)
  })
}

test('dashboard clearing history returns keyboard focus to My Places', async ({ page }) => {
  await prepare(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Wyczyść', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Moje miejsca' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Ostatnio oglądane' })).toHaveCount(0)
})
