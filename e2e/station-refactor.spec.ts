import { test, expect, type Page } from '@playwright/test'
import type { BoardApiResponse, BoardApiRow } from '../src/hooks/useBoard'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

const carrier = 'Koleje Mazowieckie — KM spółka z ograniczoną odpowiedzialnością'
const station = 'Warszawa Centralna z bardzo długą nazwą stacji do sprawdzenia pełnej treści'
const destination = 'Gorzów Wielkopolski Wschodni'
const via = 'przez Warszawa Wschodnia, Nowy Dwór Mazowiecki · +3 przystanków'

async function prepare(page: Page) {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('pkp.installDismissed.v1', JSON.stringify({ dismissedAt: Date.now() })))
  await page.route('**/api/board**', async (route) => {
    const now = Date.now()
    const rows: BoardApiRow[] = Array.from({ length: 3 }, (_, i) => ({
      scheduleId: '2026', orderId: `${104 + i}`, operatingDate: '2026-10-22', trainNumber: `${104 + i}`,
      trainLabel: `IC ${104 + i} Pociąg z bardzo długą nazwą międzynarodową`, carrier: 'KM', carrierName: carrier, category: 'IC', categoryName: null,
      headsign: destination, via: ['Warszawa Wschodnia', 'Nowy Dwór Mazowiecki'], viaRemaining: 3,
      plannedAt: new Date(now + (i + 1) * 600_000).toISOString(), actualAt: null, delayMinutes: null,
      status: 'notStarted', platform: '2', track: null, estimatedDelayMinutes: null,
    }))
    const body: BoardApiResponse = { snapshots: [{ stationId: '33605', stationName: 'Warszawa Centralna', departures: rows, arrivals: rows,
      fetchedAt: new Date(now).toISOString(), ageMs: 0 }], budget: undefined, status: 'ok', throttled: false }
    await route.fulfill({ json: body })
  })
}

async function expectNoOverflow(page: Page) {
  const measureOverflow = () => page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    table: [...document.querySelectorAll('table')].map((el) => el.parentElement!.scrollWidth - el.parentElement!.clientWidth),
  }))
  // Allow container-query layout to settle after viewport changes.
  await expect.poll(async () => {
    const overflow = await measureOverflow()
    return Math.max(overflow.document, ...overflow.table)
  }, { message: 'document and board fit after responsive layout' }).toBeLessThanOrEqual(1)
  const cells = await page.locator('td[data-cell]').evaluateAll((nodes) => nodes
    .map((el) => ({ cell: el.getAttribute('data-cell'), text: el.textContent, overflow: el.scrollWidth - el.clientWidth }))
    .filter((cell) => cell.overflow > 1))
  expect(cells).toEqual([])
}

for (const theme of ['light', 'dark']) {
  test(`station: full content and responsive states ${theme}`, async ({ page }) => {
    await prepare(page)
    let requests = 0
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/board') requests++ })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/station/33605?name=${encodeURIComponent(station)}`)
    await expect(page.getByRole('heading', { name: station, exact: true })).toBeVisible()
    await expect(page.getByText(carrier).first()).toBeVisible()
    const baseline = requests
    if (theme === 'dark') await changeTheme(page, 'Przełącz na tryb ciemny')
    for (const width of [1440, 1280, 1024, 768, 640, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await expect(page.locator('td[data-cell="direction"]').getByText(destination, { exact: true }).first()).toBeVisible()
      const viaText = page.getByText(via).first()
      if (!(await viaText.isVisible())) await page.getByRole('button', { name: 'Przystanki pośrednie (5)', exact: true }).first().click()
      await expect(viaText).toBeVisible()
      await expect(page.getByText(carrier).first()).toBeVisible()
      await expectNoOverflow(page)
      const clipped = await page.locator('td[data-cell="direction"] > span').evaluateAll((nodes) => nodes.some((el) => el.scrollHeight > el.clientHeight + 1))
      expect(clipped).toBe(false)
    }
    expect(requests).toBe(baseline)
  })

  for (const width of [320, 1440]) {
    test(`station: accessibility and tabs ${theme}, ${width}px`, async ({ page }, testInfo) => {
      await prepare(page)
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/station/33605?name=${encodeURIComponent(station)}`)
      await expect(page.getByText(carrier).first()).toBeVisible()
      if (theme === 'dark') await changeTheme(page, 'Przełącz na tryb ciemny')
      const viaText = page.getByText(via).first()
      if (!(await viaText.isVisible())) await page.getByRole('button', { name: 'Przystanki pośrednie (5)', exact: true }).first().click()
      await expect(viaText).toBeVisible()
      if (width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
        await expectNoOverflow(page)
        const title = page.getByRole('heading', { level: 1, name: station, exact: true })
        await expect.poll(async () => (await title.boundingBox())?.width ?? 0,
          { message: 'long station name has readable space at 320px and 200% text' }).toBeGreaterThanOrEqual(160)
        for (const name of ['Odjazdy', 'Przyjazdy']) {
          const tab = page.getByRole('tab', { name, exact: true })
          await expect(tab).toBeVisible()
          expect(await tab.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
          const tabBox = (await tab.boundingBox())!
          const listBox = (await page.getByRole('tablist', { name: 'Kierunek', exact: true }).boundingBox())!
          expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(listBox.x + listBox.width + 1)
        }
      }
      await expectNoOverflow(page)
      expect((await scanA11y(page)).violations).toEqual([])
      await page.screenshot({ path: `docs/pr08/${testInfo.project.name}-${theme}-${width === 320 ? '320-text200' : 'desktop'}.png`, fullPage: true, animations: 'disabled' })
      await page.getByRole('tab', { name: 'Przyjazdy', exact: true }).click()
      await expect(page.getByRole('table', { name: /Przyjazdy/ })).toBeVisible()
    })
  }
}

test('station: intermediate names expand locally with keyboard on a phone', async ({ page }) => {
  await prepare(page)
  await page.setViewportSize({ width: 375, height: 812 })
  let requests = 0
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/board') requests++ })
  await page.goto(`/station/33605?name=${encodeURIComponent(station)}`)
  const toggle = page.getByRole('button', { name: 'Przystanki pośrednie (5)', exact: true }).first()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText(via).first()).toBeHidden()
  const baseline = requests
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText(via).first()).toBeVisible()
  await expect(toggle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText(via).first()).toBeHidden()
  expect(requests).toBe(baseline)
})
