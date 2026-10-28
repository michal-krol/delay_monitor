import { test, expect, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

const observedAt = '2026-10-25T09:10:00+01:00'
const schedule = { state: 'ready', loadedAt: observedAt, ageMs: 0, phase: null, serviceDates: ['2026-10-24', '2026-10-25', '2026-10-26'], feedVersion: 'vehicle-status-ui' }
const vehicle = { id: 'V/509/6', tripId: 'course-509', serviceDate: '2026-10-25', sideNumber: '1234', observedAt, pastScheduledDeparture: true, ageSec: 0, stopsAway: 3, routeId: '509', directionId: 0, afterStopOrder: 0, fraction: 0.4, lat: 52.23, lon: 21.065, bearing: 90, headsign: 'Gocław' }
const stops = [
  { stopId: '200101', groupId: '2001', name: 'Przed Saską', code: '01', street: null, wheelchair: 0, lat: 52.23, lon: 21.06, offsetSec: 0, onRequest: false, sequence: 1, departureSec: 32400, plannedAt: '2026-10-25T09:00:00+01:00' },
  { stopId: '209703', groupId: '2097', name: 'Saska', code: '03', street: null, wheelchair: 0, lat: 52.23, lon: 21.07, offsetSec: 420, onRequest: false, sequence: 2, departureSec: 32820, plannedAt: '2026-10-25T09:07:00+01:00' },
]
const line = { routeId: '509', line: '509', longName: 'Winnica – Gocław', mode: 'bus', kind: 'regular', directions: [{ directionId: 0, headsign: 'Gocław', origin: 'Winnica', stops, departures: [], shape: null }] }

async function prepare(page: Page) {
  await page.clock.setFixedTime(new Date(observedAt))
  await page.addInitScript(() => localStorage.setItem('pkp.installDismissed.v1', JSON.stringify({ dismissedAt: Date.now() })))
  await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d9d9d9' } }] } }))
  await page.route('**/api/gtfs/vehicles?**', (route) => route.fulfill({ json: { vehicles: [vehicle], feed: { state: 'ready', ageMs: 0 } } }))
  await page.route('**/api/gtfs/line?**', (route) => route.fulfill({ json: { city: 'warszawa', line, supportsCourses: true, schedule, alerts: [], alertFeed: { state: 'ready', fetchedAt: observedAt, ageMs: 0 }, attribution: [], course: { tripId: vehicle.tripId, serviceDate: vehicle.serviceDate, directionId: 0, headsign: 'Gocław', departureSec: 32400, shape: null, stops } } }))
  await page.route('**/api/gtfs/board?**', (route) => route.fulfill({ json: { city: 'warszawa', schedule, attribution: [], stops: [{ stopId: '209703', groupId: '2097', requestedMember: '209703', activeMember: '209703', name: 'Saska', modes: ['bus'], members: [{ id: '209703', name: 'Saska', code: '03', lat: 52.23, lon: 21.07, street: null, wheelchair: 0, lines: [{ routeId: '509', line: '509', mode: 'bus', kind: 'regular' }] }], wheelchairNote: null, summary: null, alerts: [], lines: [{ routeId: '509', line: '509', mode: 'bus', kind: 'regular' }], departures: [{ tripId: vehicle.tripId, routeId: '509', line: '509', mode: 'bus', lineKind: 'regular', headsign: 'Gocław', plannedAt: stops[1].plannedAt, departureSec: 32820, serviceDate: vehicle.serviceDate, stopId: '209703', stopSequence: 2, stopOccurrence: 0, directionId: 0, platformCode: null, stopCode: '03', wheelchair: 0, frequencyBased: false, onRequest: false, vehicle }] }] } }))
}

test('board and concrete course have a static clock and a separate exact-vehicle link', async ({ page }) => {
  await prepare(page)
  await page.goto('/city/warszawa/stop/209703?przystanek=209703')
  const status = page.getByRole('img', { name: 'Po planowanym odjeździe', exact: true })
  await expect(status).toBeVisible()
  await expect(status.locator('title')).toHaveCount(0)
  await expect(status).not.toHaveAttribute('tabindex')
  expect(await status.evaluate((element) => element.closest('a,button'))).toBeNull()
  const mapLink = page.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie', exact: true })
  await expect(mapLink).toHaveAttribute('href', '/city/warszawa/map?vehicle=V%2F509%2F6&trip=course-509&date=2026-10-25')
  await expect(page.getByText(/GPS:|Pojazd:.*przystank|Pojazd w pobliżu/)).toHaveCount(0)
  const bounds = await mapLink.boundingBox()
  expect(bounds?.width).toBeGreaterThanOrEqual(44)
  expect(bounds?.height).toBeGreaterThanOrEqual(44)
  await page.getByRole('link', { name: /Wybierz kurs 509/ }).click()
  await expect(page.getByRole('heading', { name: 'Kurs linii 509', exact: true })).toBeVisible()
  await expect(status).toBeVisible()
  await expect(mapLink).toBeVisible()
  await page.reload()
  await expect(mapLink).toBeVisible()
  expect((await scanA11y(page)).violations).toEqual([])
})

test('320px board keeps both actions distinct in light, dark and enlarged text', async ({ page }, testInfo) => {
  await prepare(page)
  await page.setViewportSize({ width: 320, height: 850 })
  await page.goto('/city/warszawa/stop/209703?przystanek=209703')
  await expect(page.getByRole('img', { name: 'Po planowanym odjeździe' })).toBeVisible()
  for (const [theme, name] of [['dark', 'Przełącz na tryb ciemny'], ['light', 'Przełącz na tryb jasny']] as const) {
    await changeTheme(page, name)
    await expect(page.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie' })).toBeVisible()
    expect((await scanA11y(page)).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`board-320-${theme}.png`), fullPage: true })
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  await page.screenshot({ path: testInfo.outputPath('board-320-text-200.png'), fullPage: true })
  const destination = page.getByTestId('departure-headsign')
  expect((await destination.boundingBox())!.width).toBeGreaterThan(100)
  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 12).map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), JSON.stringify(overflow)).toBe(true)
})
