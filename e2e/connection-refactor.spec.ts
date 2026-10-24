import { expect, type Page } from '@playwright/test'
import { test } from './helpers/test'
import { scanA11y } from './helpers/axe'

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
const connection = () => `/connection/2026/104/${today()}?train=TLK%2058102`

async function stubJourney(page: Page, coordinates = true) {
  let requests = 0
  const base = Date.now()
  const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString()
  await page.route(/\/api\/train\?/, async (route) => {
    requests++
    await route.fulfill({ json: {
      scheduleId: '2026', orderId: '104', operatingDate: today(), trainStatus: 'P',
      carrierCode: 'IC', carrierName: 'PKP Intercity', category: 'TLK', categoryName: 'Twoje Linie Kolejowe',
      routeName: null, nationalNumber: '58102',
      stops: Array.from({ length: 12 }, (_, index) => ({
        stationId: index === 11 ? '33605' : String(10001 + index),
        stationName: index === 11 ? 'Warszawa Centralna' : `Stacja o długiej nazwie ${index + 1}`,
        plannedArrival: index === 0 ? null : at((index - 4) * 12 - 4),
        plannedDeparture: index === 11 ? null : at((index - 4) * 12 - 3),
        actualArrival: index > 0 && index <= 4 ? at((index - 4) * 12 - 4) : null,
        actualDeparture: index <= 4 ? at((index - 4) * 12 - 3) : null,
        arrivalDelayMinutes: index > 0 && index <= 4 ? 0 : null,
        departureDelayMinutes: index <= 4 ? 0 : null,
        isConfirmed: index <= 4, isCancelled: false, hasTrainStarted: true,
        platform: null, track: null, estimatedDelayMinutes: null,
        predictedArrival: null, predictedDeparture: null, disruptionMessages: [], stopMinutes: null, stopTypeName: null,
        lat: coordinates ? 52.1 + index * 0.01 : null,
        lon: coordinates ? 20.9 + index * 0.01 : null,
      })),
    } })
  })
  return () => requests
}

for (const theme of ['light', 'dark'] as const) {
  test(`PKP connection: responsive route priority, local expansion and accessible context (${theme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme)
    const requests = await stubJourney(page)
    await page.goto(connection())
    const timeline = page.getByRole('list', { name: 'Przebieg trasy' })
    await expect(timeline).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByText('Schemat połączeń między stacjami — nie przedstawia przebiegu torów.')).toBeVisible()
    await expect(page.getByText('Szacowana pozycja — wg rozkładu i ostatniego potwierdzenia, nie GPS.')).toBeVisible()
    const map = await page.getByRole('heading', { name: 'Mapa trasy' }).boundingBox()
    const route = await page.getByRole('heading', { name: 'Przebieg trasy' }).boundingBox()
    if (page.viewportSize()!.width < 640) expect(route!.y).toBeLessThan(map!.y)
    else expect(map!.y).toBeLessThan(route!.y)
    await page.screenshot({ path: `docs/ui0709/connection-${testInfo.project.name}-${theme}-initial.png`, fullPage: true })
    const initialRequests = requests()
    await page.getByRole('button', { name: 'Pokaż całą trasę (12 przystanków)' }).click()
    await expect(timeline.getByRole('listitem')).toHaveCount(12)
    await page.setViewportSize({ width: 320, height: 800 })
    const narrowMap = await page.getByRole('heading', { name: 'Mapa trasy' }).boundingBox()
    const narrowRoute = await page.getByRole('heading', { name: 'Przebieg trasy' }).boundingBox()
    expect(narrowRoute!.y).toBeLessThan(narrowMap!.y)
    await expect(page.getByRole('button', { name: 'Zwiń trasę' })).toHaveAttribute('aria-expanded', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `docs/ui0709/connection-${testInfo.project.name}-${theme}-320.png`, fullPage: true })
    await expect(page.getByRole('complementary', { name: 'Podsumowanie połączenia' })).toBeVisible()
    const { violations } = await scanA11y(page)
    expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
    expect(requests()).toBe(initialRequests)
  })
}

test('PKP connection: missing coordinates keep route and explain map absence', async ({ page }) => {
  await stubJourney(page, false)
  await page.goto(connection())
  await expect(page.getByText('Brak współrzędnych do pokazania mapy trasy.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Przebieg trasy' })).toBeVisible()
  await expect(page.getByRole('region', { name: /Mapa trasy pociągu/ })).toHaveCount(0)
})

test('PKP connection: station link and browser back preserve connection context', async ({ page }) => {
  await stubJourney(page)
  await page.goto(connection())
  await page.getByRole('button', { name: 'Pokaż całą trasę (12 przystanków)' }).click()
  await page.getByRole('list', { name: 'Przebieg trasy' }).getByRole('link', { name: 'Warszawa Centralna' }).click()
  await expect(page).toHaveURL(/\/station\/33605/)
  await page.goBack()
  await expect(page).toHaveURL(/\/connection\/2026\/104\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TLK 58102')
})

test('PKP connection: fresh shared link returns home', async ({ page }) => {
  await stubJourney(page)
  await page.goto(connection())
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TLK 58102')
  await page.getByRole('button', { name: 'Wróć do tablicy' }).click()
  await expect(page).toHaveURL(/\/$/)
})
