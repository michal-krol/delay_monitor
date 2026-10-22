import { test, expect, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

const schedule = { state: 'ready', loadedAt: null, ageMs: 0, phase: null, serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'], feedVersion: 'controlled-ui' }
const stops = [
  { stopId: '100101', groupId: '1001', name: 'Centrum', code: '01', street: null, wheelchair: 0, lat: 52.23, lon: 21.01, offsetSec: 0, onRequest: false, sequence: 1, departureSec: 86700, plannedAt: '2026-09-03T00:05:00+02:00' },
  { stopId: '700201', groupId: '7002', name: 'Rondo ONZ', code: '02', street: null, wheelchair: 0, lat: 52.231, lon: 21.012, offsetSec: 300, onRequest: true, sequence: 2, departureSec: 87000, plannedAt: '2026-09-03T00:10:00+02:00' },
  { stopId: '100101', groupId: '1001', name: 'Centrum', code: '01', street: null, wheelchair: 0, lat: 52.23, lon: 21.01, offsetSec: 600, onRequest: false, sequence: 3, departureSec: 87300, plannedAt: '2026-09-03T00:15:00+02:00' },
]
const line = { routeId: '20', line: '20', longName: 'Centrum – Rondo ONZ – Centrum', mode: 'tram', kind: 'regular', directions: [{ directionId: 0, headsign: 'Centrum', origin: 'Centrum', stops, departures: [{ category: 'weekday', times: [86700], frequencyBased: false }], shape: null }] }
const course = { tripId: 'loop', serviceDate: '2026-09-02', directionId: 0, headsign: 'Centrum', departureSec: 86700, shape: null, stops }

async function prepare(page: Page, variantOnly = false) {
  await page.addInitScript(() => localStorage.setItem('pkp.installDismissed.v1', JSON.stringify({ dismissedAt: Date.now() })))
  await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d9d9d9' } }] } }))
  await page.route('**/api/gtfs/vehicles?**', (route) => route.fulfill({ json: { vehicles: [], feed: { state: 'failed', ageMs: null } } }))
  await page.route('**/api/gtfs/line?**', (route) => {
    const query = new URL(route.request().url()).searchParams
    return route.fulfill({ json: { city: 'warszawa', line: variantOnly ? { ...line, directions: line.directions.map((d) => ({ ...d, stops: d.stops.filter((s) => s.stopId !== '700201') })) } : line, supportsCourses: true, schedule, alerts: [], alertFeed: { state: 'ready', fetchedAt: null, ageMs: 0 }, attribution: [], ...(query.has('trip') ? { course: query.get('trip') === 'loop' ? course : null } : {}), ...(query.has('stop') ? { timetableStop: stops.find((s) => s.stopId === query.get('stop')) ?? null, timetable: stops.filter((s) => s.stopId === query.get('stop')).map((s, occurrence) => ({ tripId: 'loop', serviceDate: '2026-09-02', sequence: s.sequence, occurrence, departureSec: s.departureSec, category: 'weekday' })) } : {}) } })
  })
  await page.route('**/api/gtfs/board?**', (route) => route.fulfill({ json: { city: 'warszawa', schedule, attribution: [], stops: [{ stopId: '1001', groupId: '1001', requestedMember: null, activeMember: null, name: 'Centrum', modes: ['tram'], members: [], wheelchairNote: null, summary: null, alerts: [], lines: [{ routeId: '20', line: '20', mode: 'tram', kind: 'regular' }], departures: [{ tripId: 'loop', routeId: '20', line: '20', mode: 'tram', lineKind: 'regular', headsign: 'Centrum', plannedAt: stops[variantOnly ? 1 : 2].plannedAt, departureSec: variantOnly ? 87000 : 87300, serviceDate: '2026-09-02', stopId: variantOnly ? '700201' : '100101', stopSequence: variantOnly ? 2 : 3, stopOccurrence: variantOnly ? 0 : 1, directionId: 0, platformCode: null, stopCode: '01', wheelchair: 0, frequencyBased: false, onRequest: false }] }] } }))
}

test('stop → concrete course → reload → same board; line badge opens the correct timetable occurrence', async ({ page }) => {
  await prepare(page)
  await page.goto('/city/warszawa/stop/1001?line=20&tab=schedule')
  await expect(page.getByText('03.09.2026', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Linie', exact: true })).toHaveCount(0)
  const badge = page.getByTestId('departure-list').getByRole('link', { name: 'Linia 20', exact: true })
  await expect(badge).toHaveAttribute('href', /stop=100101.*pane=timetable.*occ=1/)
  await page.getByRole('link', { name: /Wybierz kurs/ }).click()
  await expect(page).toHaveURL(/trip=loop.*date=2026-09-02.*seq=3/)
  await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Trasa linii · 3 przystanki/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
  await expect(page.getByText('Schemat połączeń między przystankami — brak geometrii trasy.')).toBeVisible()
  await expect(page.getByText('Nie udało się pobrać pozycji pojazdu.')).toBeVisible()
  await page.getByRole('link', { name: 'Wróć do odjazdów', exact: true }).filter({ visible: true }).last().click()
  await expect(page).toHaveURL(/\/stop\/1001\?line=20&tab=schedule$/)
  await badge.click()
  await expect(page.getByRole('link', { name: /00:15, Poniedziałek/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /00:05, Poniedziałek/ })).toHaveCount(0)
})

test('variant-only stop: board badge opens actual stop timetable and minute selects the actual course', async ({ page }) => {
  await prepare(page, true)
  await page.goto('/city/warszawa/stop/1001')
  const badge = page.getByTestId('departure-list').getByRole('link', { name: 'Linia 20', exact: true })
  await expect(badge).toHaveAttribute('href', /stop=700201/)
  await badge.click()
  await expect(page.getByRole('group', { name: 'Wybrany rozkład' })).toContainText('Rondo ONZ 02')
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    const panes = page.getByRole('group', { name: 'Widok linii' })
    await panes.getByRole('button', { name: 'Trasa', exact: true }).click()
    await expect(page).toHaveURL(/stop=700201/)
    await panes.getByRole('button', { name: 'Rozkład', exact: true }).click()
    await expect(page).toHaveURL(/stop=700201/)
  }
  await page.reload()
  await expect(page.getByRole('group', { name: 'Wybrany rozkład' })).toContainText('Rondo ONZ 02')
  await page.getByRole('link', { name: /00:10, Poniedziałek/ }).click()
  await expect(page).toHaveURL(/trip=loop.*stop=700201.*seq=2/)
  await expect(page.getByRole('heading', { name: /Trasa linii · 3 przystanki/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rondo ONZ 02.*00:10/ })).toHaveAttribute('aria-pressed', 'true')
})

test('course map and axis share selection, theme/resize preserve course without another course request', async ({ page }) => {
  await prepare(page)
  let courseRequests = 0
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname === '/api/gtfs/line' && url.searchParams.has('trip')) courseRequests++ })
  await page.goto('/city/warszawa/line/20?trip=loop&date=2026-09-02&stop=100101&seq=3')
  await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
  const axisStop = page.getByRole('button', { name: /Rondo ONZ 02.*00:10/ })
  await axisStop.click()
  await expect(page).toHaveURL(/seq=2/)
  const marker = page.getByRole('button', { name: 'Rondo ONZ 02', exact: true })
  await expect(marker).toHaveAttribute('aria-pressed', 'true')
  await marker.focus()
  await page.keyboard.press('Enter')
  await expect(axisStop).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await changeTheme(page, 'Przełącz na tryb ciemny')
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(axisStop).toHaveAttribute('aria-pressed', 'true')
  expect(courseRequests).toBe(1)
})

for (const theme of ['Jasny', 'Ciemny']) {
  test(`course ${theme}: narrow text200%, axe, desktop and phone visual evidence`, async ({ page }, testInfo) => {
    await prepare(page)
    await page.goto('/city/warszawa/line/20?trip=loop&date=2026-09-02&stop=100101&seq=3')
    await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
    if (theme === 'Ciemny') await changeTheme(page, 'Przełącz na tryb ciemny')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: `docs/pr06/${testInfo.project.name}-${theme}-desktop.png`, fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 320, height: 812 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    const nameBox = await page.getByRole('button', { name: /Centrum 01.*00:05/ }).locator(':scope > span').first().boundingBox()
    expect(nameBox!.width, 'short stop names must not collapse into a column of single letters').toBeGreaterThanOrEqual(120)
    expect(nameBox!.height).toBeLessThan(160)
    expect((await scanA11y(page)).violations).toEqual([])
    await page.screenshot({ path: `docs/pr06/${testInfo.project.name}-${theme}-phone200.png`, fullPage: true, animations: 'disabled' })
  })
}

test('real mock API resolves an actual course and its calendar without another feed fetch', async ({ request }) => {
  const lineResponse = await request.get('/api/gtfs/line?city=warszawa&route=20')
  const body = await lineResponse.json()
  expect(body.supportsCourses).toBe(true)
  const date = body.schedule.serviceDates[1]
  const response = await request.get(`/api/gtfs/line?${new URLSearchParams({ city: 'warszawa', route: '20', trip: '20-wd-0-1', date })}`)
  const actual = await response.json()
  expect(actual.course.tripId).toBe('20-wd-0-1')
  expect(actual.course.stops.length).toBeGreaterThan(1)
  expect(actual.course.shape).not.toBeNull()
})
