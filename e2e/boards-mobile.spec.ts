import { test, expect, type Locator, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { showBoardContext } from './helpers/info'

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

test('ekran miasta na telefonie: najpierw wyszukiwarka, statystyki zwinięte do linii pod nią, rozwijane dotknięciem', async ({ page }) => {
  await page.goto('/city/warszawa')
  const search = page.getByRole('combobox', { name: /Szukaj stacji kolejowej lub przystanku/ })
  const summary = page.getByText('Statystyki', { exact: true })
  const tile = page.getByText('przystanki miejskie', { exact: true })
  await expect(search).toBeVisible({ timeout: READY })
  await expect(summary).toBeVisible()
  await expect(tile).toBeHidden()
  expect((await search.boundingBox())!.y).toBeLessThan((await summary.boundingBox())!.y)
  await summary.click()
  await expect(tile).toBeVisible()
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

test('kierunek z arkusza „Info” filtruje tablicę i ustawia ?direction= (chipów nad tablicą na telefonie nie ma)', async ({ page }) => {
  await firstBoardTime(page, STATION)
  await expect(page.getByRole('group', { name: 'Najpopularniejsze kierunki' })).toHaveCount(0)
  await showBoardContext(page)
  const sheet = page.getByRole('dialog', { name: 'Informacje o stacji' })
  const destination = sheet.getByRole('button', { pressed: false }).filter({ hasText: /połącz/ }).first()
  const name = (await destination.locator('span').first().textContent())!.trim()
  await destination.click()
  await expect(sheet.getByRole('button', { pressed: true }).filter({ hasText: name })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('direction')).toBe(name)
})

test('375×812: pierwszy wiersz tablicy stacji najwyżej 340 px od góry (było ~470)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const time = await firstBoardTime(page, STATION)
  expect((await time.boundingBox())!.y).toBeLessThanOrEqual(340)
})

/** Ramki komórek pierwszego wiersza tablicy (karta na telefonie). */
async function firstRowBoxes(page: Page) {
  const row = page.locator('.board-table tbody tr[data-status]').first()
  const box = async (cell: string) => (await row.locator(`td[data-cell="${cell}"]`).boundingBox())!
  return { row, time: await box('time'), direction: await box('direction'), status: await box('status'), train: await box('train'), platform: await box('platform') }
}

test('karta wiersza 375 px: godzina po lewej, status pod kierunkiem, pociąg i „Peron · tor” w jednym rzędzie, bez przewoźnika', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const { row, time, direction, status, train, platform } = await firstRowBoxes(page)
  expect(time.x + time.width).toBeLessThanOrEqual(direction.x)
  expect(status.y).toBeGreaterThanOrEqual(direction.y + direction.height - 1)
  expect(Math.abs(train.y - platform.y), 'pociąg i peron w jednym rzędzie').toBeLessThanOrEqual(4)
  expect(train.y).toBeGreaterThanOrEqual(status.y + status.height - 1)
  await expect(row.locator('td[data-cell="platform"]')).toContainText(/Peron/)
  // Widoczny tekst komórki (innerText pomija `display: none`): kategoria + numer, bez linii przewoźnika.
  expect((await row.locator('td[data-cell="train"]').innerText()).trim().split('\n')).toHaveLength(2)
})

test('karta wiersza przy szerszym telefonie (600 px): status obok kierunku', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 812 })
  await firstBoardTime(page, STATION)
  const { direction, status } = await firstRowBoxes(page)
  expect(status.x).toBeGreaterThanOrEqual(direction.x + direction.width - 1)
  expect(status.y).toBeLessThan(direction.y + direction.height)
})

test('karta wiersza przy tekście 200 %: peron w osobnym rzędzie pod pociągiem, bez przewijania w bok', async ({ page }) => {
  await firstBoardTime(page, STATION)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const { train, platform } = await firstRowBoxes(page)
  expect(platform.y).toBeGreaterThanOrEqual(train.y + train.height - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('karta stacji na telefonie: ← nazwa ★ ⋮ w jednym rzędzie, bez okruszków i KPI; „Udostępnij” w „Więcej”', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const heading = page.getByRole('heading', { name: 'Warszawa Centralna' })
  await expect(heading).toHaveCount(1)
  await expect(page.getByRole('navigation', { name: 'Ścieżka nawigacji' })).toHaveCount(0)
  await expect(page.getByTestId('station-stats')).toHaveCount(0)
  const row = [page.getByRole('link', { name: 'Wróć do Pulpitu' }), heading, page.getByRole('button', { name: 'Przypnij do Pulpitu' }), page.getByRole('button', { name: 'Więcej' })]
  const boxes = await Promise.all(row.map((locator) => locator.boundingBox()))
  for (const box of boxes) expect(Math.abs(box!.y + box!.height / 2 - (boxes[0]!.y + boxes[0]!.height / 2)), 'jeden górny rząd').toBeLessThanOrEqual(12)
  await page.getByRole('button', { name: 'Więcej' }).click()
  const menu = page.getByRole('list', { name: 'Więcej' })
  await expect(menu.getByRole('button', { name: 'Udostępnij' })).toBeVisible()
  await menu.getByRole('button', { name: 'Informacje o stacji' }).click()
  await expect(page.getByRole('dialog', { name: 'Informacje o stacji' })).toBeVisible()
})

test('selektor kierunku w miejscu KPI: między kartą stacji a zakładkami, filtruje i ustawia ?direction=', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const select = page.getByRole('combobox', { name: 'Kierunek' })
  await expect(select).toHaveValue('')
  const tabs = (await page.getByTestId('board-tabs-bar').boundingBox())!
  const selectBox = (await select.boundingBox())!
  expect(selectBox.y + selectBox.height).toBeLessThanOrEqual(tabs.y)
  expect(selectBox.height).toBeGreaterThanOrEqual(44)
  const name = (await select.locator('option').nth(1).textContent())!.trim()
  await select.selectOption(name)
  await expect.poll(() => new URL(page.url()).searchParams.get('direction')).toBe(name)
  // Filtr działa po przerenderowaniu — czekamy, aż każdy wiersz ma wybrany kierunek.
  await expect(async () => {
    const headsigns = await page.locator('td[data-cell="direction"]').allTextContents()
    expect(headsigns.length).toBeGreaterThan(0)
    for (const text of headsigns) expect(text).toContain(name)
  }).toPass({ timeout: 5_000 })
})

test('zakładki i Info w jednej siatce', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const tabs = (await page.getByRole('tablist', { name: 'Kierunek' }).boundingBox())!
  const info = (await page.getByRole('button', { name: 'Info' }).boundingBox())!
  expect(Math.abs(tabs.y - info.y), 'zakładki i Info w jednym rzędzie').toBeLessThanOrEqual(6)
  expect(info.height).toBeGreaterThanOrEqual(44)
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

  const { violations } = await scanA11y(page)
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
  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
