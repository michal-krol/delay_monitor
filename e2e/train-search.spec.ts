import { test, expect, type Page } from '@playwright/test'
import { isDesktop, openSearch, searchField } from './helpers/search'
import { scanA11y } from './helpers/axe'

async function surface(page: Page, project: string) {
  await page.goto(isDesktop(project) ? '/' : '/search')
  await page.waitForLoadState('networkidle')
  return isDesktop(project) ? openSearch(page, project) : page.getByRole('main')
}

for (const query of ['4501', 'baltyk']) {
  test(`pociąg po frazie ${query}: data, relacja i konkretny kurs`, async ({ page }, info) => {
    const search = await surface(page, info.project.name)
    let trainRequests = 0
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/train') trainRequests++ })
    await searchField(search).fill(query)
    const result = search.getByRole('region', { name: 'Pociągi' }).getByRole('button', { name: /4501.*BAŁTYK/ })
    await expect(result).toBeVisible()
    await expect(result).toContainText(/\d{2}\.\d{2}\.\d{4}/)
    await expect(result).toContainText('Warszawa Centralna')
    expect(trainRequests).toBe(0)
    await result.click()
    await expect(page).toHaveURL(/\/connection\/2026\/101\/\d{4}-\d{2}-\d{2}/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
}

test('niedostępne źródło pociągów nie ukrywa miejsc ani nie udaje braku wyników', async ({ page }, info) => {
  await page.route('**/api/search?**', (route) => route.fulfill({ json: {
    stations: [{ id: '33605', name: 'Warszawa Centralna', kind: 'rail', mode: 'rail' }],
    trains: [], sources: { rail: 'ready', transit: 'ready', trains: 'unavailable' },
  } }))
  const search = await surface(page, info.project.name)
  await searchField(search).fill('war')
  await expect(search.getByText('Wyszukiwanie pociągów jest chwilowo niedostępne')).toBeVisible()
  await expect(search.getByRole('button', { name: /^Warszawa Centralna/ })).toBeVisible()
  await expect(search.getByText('Brak wyników dla tej frazy')).toHaveCount(0)
  await expect(search.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible()
})

test('różne dni, długa relacja i klawiatura w obu motywach przy 320 px', async ({ page }, info) => {
  await page.route('**/api/search?**', (route) => route.fulfill({ json: {
    stations: [], sources: { rail: 'ready', transit: 'ready', trains: 'ready' },
    trains: ['2026-10-21', '2026-10-22'].map((operatingDate) => ({
      scheduleId: '2026', orderId: '101', operatingDate, nationalNumber: '4501', name: 'BAŁTYK',
      origin: 'Bardzo długa nazwa stacji początkowej', destination: 'Warszawa Centralna',
    })),
  } }))
  const search = await surface(page, info.project.name)
  if (!isDesktop(info.project.name)) await page.setViewportSize({ width: 320, height: 812 })
  await searchField(search).fill('4501')
  const group = search.getByRole('region', { name: 'Pociągi' })
  await expect(group.getByRole('button')).toHaveCount(2)
  await expect(group).toContainText('21.10.2026')
  await expect(group).toContainText('22.10.2026')
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await scanA11y(page)).violations).toEqual([])
  }
  await searchField(search).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(group.getByRole('button').first()).toBeFocused()
  await page.screenshot({ path: `docs/pr04/train-search-${info.project.name}.png`, fullPage: true })
})

test('wybrany pociąg na mapie otwiera szczegóły kursu', async ({ page }) => {
  await page.goto('/city/warszawa/map')
  await page.waitForLoadState('networkidle')
  // The named region is the MapLibre canvas itself, created by the hydrated map effect.
  await expect(page.getByRole('region', { name: 'Mapa transportu — Warszawa' })).toBeVisible()
  await page.getByRole('button', { name: 'Szukaj', exact: true, expanded: false }).click()
  const input = page.getByRole('searchbox', { name: /^Stacja, przystanek/ })
  await input.fill('4501')
  await expect(input).toHaveValue('4501')
  const result = page.getByRole('region', { name: 'Pociągi' }).getByRole('button', { name: /4501.*BAŁTYK/ })
  await result.focus()
  await page.keyboard.press('Escape')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await input.fill('4501')
  await result.click()
  await expect(page).toHaveURL(/\/connection\/2026\/101\//)
})

test('przypinanie oferuje tylko miejsca, nawet gdy API zwraca pociągi', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Przypnij do Startu' })
  await dialog.getByRole('searchbox').fill('4501')
  await expect(dialog.getByRole('status')).toContainText('Brak wyników')
  await expect(dialog.getByRole('region', { name: 'Pociągi' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /BAŁTYK/ })).toHaveCount(0)
})
