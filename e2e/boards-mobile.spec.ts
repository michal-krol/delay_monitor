import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// PR4: tablice „najpierw odjazdy” na telefonie — pierwszy odjazd bez przewijania, przyklejony
// pasek zakładek, arkusz „Info” z tym samym kontekstem co prawa kolumna.

const READY = 45_000
const STATION = '/station/33605?name=Warszawa%20Centralna'
const STOP = '/city/warszawa/stop/1001'
const CITY_STATION = '/city/warszawa?station=33605&name=Warszawa%20Centralna'

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'układ telefonu (poniżej sm)')
})
test.use({ viewport: { width: 375, height: 667 } })

/** Górna krawędź dolnego paska — „bez przewijania” znaczy: nad nim. */
async function navTop(page: Page): Promise<number> {
  return (await page.getByRole('navigation', { name: 'Nawigacja główna' }).boundingBox())!.y
}

async function expectAboveNav(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible({ timeout: READY })
  const box = (await locator.boundingBox())!
  expect(box.y + box.height, 'pierwszy odjazd schowany pod dolnym paskiem').toBeLessThanOrEqual(await navTop(page))
}

/** Tablica PKP: snapshot przychodzi po kilku próbach — przeładowanie jak w `aside-layout.spec.ts`. */
async function firstBoardTime(page: Page, path: string): Promise<Locator> {
  await page.goto(path)
  const time = page.locator('td[data-cell="time"]').first()
  await expect(async () => {
    await page.reload()
    await expect(time).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: READY })
  return time
}

test('375×667: pierwszy odjazd stacji widać bez przewijania', async ({ page }) => {
  await expectAboveNav(page, await firstBoardTime(page, STATION))
})

test('375×667: pierwszy odjazd na ekranie miasta z wybraną stacją widać bez przewijania', async ({ page }) => {
  await expectAboveNav(page, await firstBoardTime(page, CITY_STATION))
})

test('375×667: najbliższy odjazd przystanku „Centrum” widać bez przewijania', async ({ page }) => {
  await page.goto(STOP)
  const panel = page.getByRole('tabpanel')
  // Wyróżniony blok „Najbliższy odjazd” albo — gdy nic nie odjeżdża — pierwszy wiersz listy.
  const first = panel.getByText('Najbliższy odjazd').or(panel.getByTestId('departure-list').locator('li').first()).first()
  await expectAboveNav(page, first)
})

test('ekran miasta na telefonie: najpierw wyszukiwarka, kafelki statystyk pod nią', async ({ page }) => {
  await page.goto('/city/warszawa')
  const search = page.getByRole('combobox', { name: /Szukaj stacji kolejowej lub przystanku/ })
  const tile = page.getByText('przystanki miejskie', { exact: true })
  await expect(search).toBeVisible({ timeout: READY })
  await expect(tile).toBeVisible()
  expect((await search.boundingBox())!.y).toBeLessThan((await tile.boundingBox())!.y)
})

test('pasek zakładek przystanku zostaje pod nagłówkiem po przewinięciu o 600 px', async ({ page }) => {
  // Mock zespołu ma kilkanaście odjazdów — lista wydłużona kopiami, żeby było co przewijać.
  await page.route('**/api/gtfs/board**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const stop of body.stops ?? []) {
      const rows = stop.departures ?? []
      if (rows.length > 0) stop.departures = Array.from({ length: 40 }, (_, i) => ({ ...rows[i % rows.length], tripId: `x${i}` }))
    }
    await route.fulfill({ response, json: body })
  })
  await page.goto(STOP)
  await page.getByRole('tab', { name: 'Pełny rozkład' }).click()
  await expect(page.getByTestId('departure-list').locator('li').nth(20)).toBeAttached({ timeout: READY })
  await page.evaluate(() => window.scrollBy(0, 600))
  const bar = page.getByTestId('stop-tabs-bar')
  await expect(bar).toBeInViewport()
  await expect(page.getByRole('tab', { name: 'Pełny rozkład' })).toBeInViewport()
  const header = (await page.locator('header').first().boundingBox())!
  expect(Math.abs((await bar.boundingBox())!.y - (header.y + header.height))).toBeLessThanOrEqual(2)
})

test('pasek Odjazdy/Przyjazdy stacji zostaje pod nagłówkiem po przewinięciu o 600 px', async ({ page }) => {
  // Mock ma kilka pociągów na stację — tablica wydłużona kopiami wierszy, żeby było co przewijać.
  await page.route('**/api/board**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const snapshot of body.snapshots ?? []) {
      if (snapshot === null) continue
      const rows = snapshot.departures
      snapshot.departures = Array.from({ length: 30 }, (_, i) => ({ ...rows[i % rows.length], trainNumber: `x${i}`, orderId: `9${i}` }))
    }
    await route.fulfill({ response, json: body })
  })
  await firstBoardTime(page, STATION)
  await page.getByRole('button', { name: /Pokaż więcej połączeń/ }).click()
  await page.evaluate(() => window.scrollBy(0, 600))
  const bar = page.getByTestId('board-tabs-bar')
  await expect(bar).toBeInViewport()
  await expect(page.getByRole('tab', { name: 'Odjazdy' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Info' })).toBeInViewport()
})

test('ikona utrudnienia widoczna w karcie pociągu na telefonie (109)', async ({ page }) => {
  await firstBoardTime(page, STATION)
  await page.getByRole('tab', { name: 'Przyjazdy' }).click()
  await expect(page.getByRole('img', { name: 'Utrudnienie na trasie' }).first()).toBeVisible()
})

test('chip najpopularniejszego kierunku filtruje tablicę i ustawia ?direction=', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const chips = page.getByRole('group', { name: 'Najpopularniejsze kierunki' })
  const chip = chips.getByRole('button').first()
  const name = (await chip.textContent())!.trim()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => new URL(page.url()).searchParams.get('direction')).toBe(name)
})

test('„Info” otwiera arkusz z kontekstem stacji, Escape zamyka i oddaje fokus', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const info = page.getByRole('button', { name: 'Info' })
  // Klawiaturą: Safari nie fokusuje przycisku po kliknięciu, więc fokus nie miałby dokąd wrócić.
  await info.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Informacje o stacji' })
  await expect(sheet).toBeVisible()
  // Te same karty co prawa kolumna na desktopie (jedna implementacja: `StationAside`).
  for (const heading of ['Natężenie ruchu dzisiaj', 'Utrudnienia na tej stacji']) {
    await expect(sheet.getByRole('heading', { name: heading })).toBeAttached()
  }
  await expect(sheet.getByText('Odjazdy dzisiaj')).toBeAttached()
  await expect(page.locator('.bottom-sheet')).toHaveAttribute('data-snap', 'half')

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(info).toBeFocused()
})

test('„Info” przystanku: mapa, natężenie i linie w arkuszu; × zamyka', async ({ page }) => {
  await page.goto(STOP)
  await page.getByRole('button', { name: 'Info' }).click()
  const sheet = page.getByRole('dialog', { name: 'Informacje o przystanku' })
  await expect(sheet.getByRole('heading', { name: 'Natężenie ruchu dziś' })).toBeAttached({ timeout: READY })
  await expect(sheet.getByRole('heading', { name: 'Linie w tym zespole' })).toBeAttached()
  await sheet.getByRole('button', { name: 'Zamknij informacje' }).click()
  await expect(sheet).toHaveCount(0)
})

test('a11y: przystanek na telefonie (chipy, przyklejony pasek) bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(STOP)
  await expect(page.getByRole('tab', { name: 'Najbliższe odjazdy' })).toBeVisible({ timeout: READY })
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
