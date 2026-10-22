import { test, expect, type Page } from '@playwright/test'
import type { BoardApiRow } from '../src/hooks/useBoard'
import type { TransitBoardResponse } from '../src/hooks/useTransitBoard'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

const pins = [
  { kind: 'pkp', id: '33605', name: 'Warszawa Centralna z bardzo długą nazwą dla sprawdzenia zawijania' },
  { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' },
]

async function prepare(page: Page, count = 4) {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript((value) => localStorage.setItem('monitor.favourites.v2', JSON.stringify(value)), pins)
  // Deliberately controlled UI data, not an assertion about real traffic (AGENTS.md #8).
  await page.route('**/api/board**', async (route) => {
    const now = Date.now()
    const departures: BoardApiRow[] = Array.from({ length: count }, (_, i) => ({
      scheduleId: `test-${i}`, orderId: `test-${i}`, operatingDate: '2026-10-22',
      trainNumber: `${100 + i}`, trainLabel: `Testowy ${i + 1}`, carrier: 'IC', carrierName: 'PKP Intercity',
      category: 'IC', categoryName: null, headsign: 'Kraków Główny',
      plannedAt: new Date(now + (i + 1) * 600_000).toISOString(), actualAt: null,
      delayMinutes: null, status: 'notStarted', platform: '2', estimatedDelayMinutes: null,
    }))
    await route.fulfill({ json: { snapshots: [{ stationId: '33605', stationName: 'Warszawa Centralna', departures, arrivals: [], fetchedAt: new Date(now).toISOString(), ageMs: 0 }], status: 'ok', throttled: false } })
  })
  await page.route('**/api/gtfs/board**', async (route) => {
    const departures = Array.from({ length: count }, (_, i) => ({
      tripId: `test-${i}`, routeId: '20', line: '20', mode: 'tram' as const, lineKind: 'regular' as const, headsign: `Piaski ${i + 1}`,
      plannedAt: new Date(Date.now() + (i + 1) * 600_000).toISOString(), departureSec: 52200 + i * 600,
      serviceDate: '2026-10-22', stopId: '100101', platformCode: '01', stopCode: null,
      wheelchair: 0, frequencyBased: false, onRequest: false, vehicle: null,
    })).slice(0, Number(new URL(route.request().url()).searchParams.get('limit') ?? 3))
    const body: TransitBoardResponse = { city: 'warszawa', stops: [{ stopId: '1001', groupId: '1001', requestedMember: null, name: 'Centrum', modes: ['tram'], departures, lines: [], members: [], activeMember: null, wheelchairNote: null, summary: null, alerts: [] }], schedule: { state: 'ready', loadedAt: null, ageMs: null, phase: null, serviceDates: null, feedVersion: null }, attribution: [] }
    await route.fulfill({ json: body })
  })
}

for (const count of [4, 1]) {
  test(`Start: available courses ${count}, no filling missing rows`, async ({ page }) => {
    await prepare(page, count)
    await page.goto('/')
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(2)
    await expect(cards.first().getByRole('listitem')).toHaveCount(Math.min(count, 3))
    await expect(cards.last().getByTestId('departure-list').getByRole('listitem')).toHaveCount(Math.min(count, 3))
    if (count === 4) {
      await expect(cards.first()).not.toContainText('Testowy 4')
      await expect(cards.last()).not.toContainText('Piaski 4')
    }
  })
}

test('Start: one stats instance survives expand, resize and theme without data refetch', async ({ page }) => {
  await prepare(page)
  const counts = { board: 0, transit: 0, stats: 0 }
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path === '/api/board') counts.board++
    if (path === '/api/gtfs/board') counts.transit++
    if (path === '/api/network-stats') counts.stats++
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.getByRole('article').last().getByTestId('departure-list').getByRole('listitem')).toHaveCount(3)
  const toggle = page.getByRole('button', { name: /Dziś w Polsce/ })
  await expect(toggle).toHaveCount(1)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  const region = page.getByRole('region', { name: 'Statystyki sieci kolejowej' })
  await expect(region).toBeVisible()
  const panelId = await region.getAttribute('id')
  const baseline = { ...counts }
  expect(baseline).toEqual({ board: 1, transit: 1, stats: 1 })
  const card = page.getByRole('article').last()
  expect((await toggle.boundingBox())!.y).toBeGreaterThan((await card.boundingBox())!.y)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(region).toHaveAttribute('id', panelId!)
  expect((await toggle.boundingBox())!.x).toBeGreaterThan((await card.boundingBox())!.x)
  await changeTheme(page, 'Przełącz na tryb ciemny')
  await page.setViewportSize({ width: 320, height: 812 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await toggle.click()
  await expect(region).toHaveAttribute('id', panelId!)
  expect(counts).toEqual(baseline)
})

for (const theme of ['Jasny', 'Ciemny']) {
  test(`Start: ${theme}, narrow text200%, accessible expanded stats`, async ({ page }, testInfo) => {
    await prepare(page)
    await page.goto('/')
    await expect(page.getByRole('article').last().getByTestId('departure-list').getByRole('listitem')).toHaveCount(3)
    if (theme === 'Ciemny') await changeTheme(page, 'Przełącz na tryb ciemny')
    await page.getByRole('button', { name: /Dziś w Polsce/ }).click()
    await expect(page.getByRole('region', { name: 'Statystyki sieci kolejowej' })).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: `docs/pr05/${testInfo.project.name}-${theme}-desktop.png`, fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 320, height: 812 })
    await page.screenshot({ path: `docs/pr05/${testInfo.project.name}-${theme}-phone.png`, fullPage: true, animations: 'disabled' })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth - document.documentElement.clientWidth, nodes: [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > 321).map((el) => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 60), right: el.getBoundingClientRect().right })).slice(0, 20) }))
    expect(overflow.width, JSON.stringify(overflow.nodes)).toBeLessThanOrEqual(0)
    expect((await scanA11y(page)).violations).toEqual([])
  })
}
