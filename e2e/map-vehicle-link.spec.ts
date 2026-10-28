import { test, expect, type Page } from './helpers/test'
import { scanA11y } from './helpers/axe'

const target = {
  id: 'V/509/6', tripId: '2026-10-25:509:NdS:6:1314', serviceDate: '2026-10-25',
  lat: 52.23116, lon: 21.06149, bearing: 157, sideNumber: '1234', ageSec: 5,
  routeId: '509', shortName: '509', mode: 'bus', kind: 'regular', directionId: 0,
  headsign: 'Gocław', nextStop: { name: 'Saska', code: '03', groupId: '2097' },
}
const link = `/city/warszawa/map?${new URLSearchParams({ vehicle: target.id, trip: target.tripId, date: target.serviceDate })}`

async function mockVehicle(page: Page, current: () => unknown[]) {
  await page.route('**/api/gtfs/city-vehicles?**', route => route.fulfill({ json: { vehicles: current(), feed: { state: 'ready', ageMs: 0 }, alertLines: [] } }))
}

for (const dpr of [1, 2, 3]) {
  test(`dated vehicle link selects Navigation2 at DPR ${dpr}, survives reload and supports back`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({ baseURL, deviceScaleFactor: dpr, viewport: { width: dpr === 1 ? 1280 : 390, height: 844 } })
    const page = await context.newPage()
    await mockVehicle(page, () => [target])
    await page.goto('/city/warszawa/stop/1001')
    await page.goto(link)
    await expect(page.getByText('Numer boczny', { exact: true })).toBeVisible()
    await expect(page.getByText('1234', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Śledź pojazd', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => new URL(page.url()).searchParams.get('at')).toMatch(/^52\.23116,21\.06149,/)
    const canvas = page.locator('[data-map-view] canvas').first()
    await expect(canvas).toBeVisible()
    await testInfo.attach(`navigation2-dpr-${dpr}`, { body: await canvas.screenshot(), contentType: 'image/png' })
    await page.reload()
    await expect(page.getByText('1234', { exact: true })).toBeVisible()
    expect((await scanA11y(page)).violations).toEqual([])
    await page.goBack()
    await expect(page).toHaveURL(/\/stop\/1001/)
    await context.close()
  })
}

test('a changed trip, vanished vehicle or stale GPS never substitutes another bus', async ({ page }) => {
  let vehicles: unknown[] = [target]
  await mockVehicle(page, () => vehicles)
  await page.goto(link)
  await expect(page.getByText('1234', { exact: true })).toBeVisible()
  for (const next of [[{ ...target, tripId: 'another-trip', sideNumber: '9999' }], [], [{ ...target, ageSec: 181 }]]) {
    vehicles = next
    await page.reload()
    await expect(page.getByText('Wskazany pojazd nie jest dostępny dla tego kursu.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Śledź pojazd', exact: true })).toHaveCount(0)
    await expect(page.getByText('9999', { exact: true })).toHaveCount(0)
  }
})

test('raw GPS remains locatable without a resolved service date', async ({ page }) => {
  await mockVehicle(page, () => [{ ...target, serviceDate: null }])
  await page.goto(`/city/warszawa/map?${new URLSearchParams({ vehicle: target.id, trip: target.tripId })}`)
  await expect(page.getByText('1234', { exact: true })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('at')).toMatch(/^52\.23116,21\.06149,/)
  await expect(page.getByRole('button', { name: 'Śledź pojazd', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect((await scanA11y(page)).violations).toEqual([])
})

test('malformed vehicle parameters are ignored without opening a card', async ({ page }) => {
  await mockVehicle(page, () => [target])
  await page.goto('/city/warszawa/map?vehicle=%3Cscript%3E&trip=t&date=2026-02-30')
  await expect(page.getByRole('button', { name: 'Śledź pojazd', exact: true })).toHaveCount(0)
  await expect(page.getByText('Wskazany pojazd nie jest dostępny dla tego kursu.')).toHaveCount(0)
})
