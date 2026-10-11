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

test('arkusz „Info” bez listy kierunków (jeden filtr: selektor nad tablicą; chipów nad tablicą też nie ma)', async ({ page }) => {
  await firstBoardTime(page, STATION)
  await expect(page.getByRole('group', { name: 'Najpopularniejsze kierunki' })).toHaveCount(0)
  await showBoardContext(page)
  const sheet = page.getByRole('dialog', { name: 'Informacje o stacji' })
  await expect(sheet.getByRole('heading', { name: 'Utrudnienia na tej stacji' })).toBeVisible()
  await expect(sheet.getByText('Najpopularniejsze kierunki')).toHaveCount(0)
})

/** Karty tablicy (telefon): `tr[data-status]` pomija szkielet i pusty stan. */
const boardRows = (page: Page): Locator => page.locator('.board-table tbody tr[data-status]')

test('375×812: dwa pierwsze wiersze w całości nad dolnym paskiem, także z powiadomieniem o utrudnieniach (pierwszy ≤ 420 px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await firstBoardTime(page, STATION)
  // Mock stacji 33605 ma jedno utrudnienie — powiadomienie stoi nad zakładkami.
  await expect(page.getByRole('button', { name: /utrudnie.* na stacji/ })).toBeVisible()
  const nav = await navTop(page)
  for (const index of [0, 1]) {
    const box = (await boardRows(page).nth(index).boundingBox())!
    expect(box.y + box.height, `wiersz ${index + 1} schowany pod dolnym paskiem`).toBeLessThanOrEqual(nav)
  }
  expect((await boardRows(page).first().boundingBox())!.y).toBeLessThanOrEqual(420)
})

test('375×812: bez utrudnień nie ma powiadomienia, a pierwszy wiersz zaczyna się najwyżej 360 px od góry', async ({ page }) => {
  await page.route('**/api/board**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const snapshot of body.snapshots ?? []) if (snapshot !== null) snapshot.disruptionMessages = []
    await route.fulfill({ response, json: body })
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await firstBoardTime(page, STATION)
  await expect(page.getByRole('button', { name: /utrudnie.* na stacji/ })).toHaveCount(0)
  expect((await boardRows(page).first().boundingBox())!.y).toBeLessThanOrEqual(360)
})

/**
 * Ramki komórek pierwszego wiersza tablicy (karta na telefonie). Jeden odczyt w przeglądarce, nie pięć osobnych
 * `boundingBox()`: wiersz wsuwa się/przesuwa przez 160 ms (`useRowAnimation`), a odczyty w różnych momentach
 * widziałyby komórki w różnych klatkach animacji (przesunięcie rzędu 7 px pod obciążeniem).
 */
async function firstRowBoxes(page: Page) {
  const row = boardRows(page).first()
  const boxes = await row.evaluate((tr) => {
    const rect = (cell: string) => {
      const { x, y, width, height } = tr.querySelector(`td[data-cell="${cell}"]`)!.getBoundingClientRect()
      return { x, y, width, height }
    }
    return { time: rect('time'), direction: rect('direction'), status: rect('status'), train: rect('train'), platform: rect('platform') }
  })
  return { row, ...boxes }
}

test('karta wiersza 375 px: godzina po prawej od kierunku, status pod pociągiem, peron i tor w osobnym rzędzie, bez przewoźnika', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const { row, time, direction, status, train, platform } = await firstRowBoxes(page)
  expect(time.x).toBeGreaterThanOrEqual(direction.x + direction.width - 1)
  expect(train.y).toBeGreaterThanOrEqual(direction.y + direction.height - 1)
  expect(status.y).toBeGreaterThanOrEqual(train.y + train.height - 1)
  expect(platform.y).toBeGreaterThanOrEqual(status.y + status.height - 1)
  await expect(row.locator('td[data-cell="platform"]')).toContainText(/Peron .* · Tor/)
  // Przewoźnik jest tylko w tabeli: w karcie jego linia jest schowana (`hidden sm:flex`).
  await expect(row.locator('td[data-cell="train"] .hidden')).toBeHidden()
})

test('przewoźnik tylko w tabeli (1024 px), podpisy „Peron/tor” tylko w karcie (375 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 812 })
  await firstBoardTime(page, STATION)
  const row = page.locator('.board-table tbody tr[data-status]').first()
  const lines = (await row.locator('td[data-cell="train"]').innerText()).trim().split('\n')
  const carrier = row.getByText(lines[lines.length - 1]!, { exact: true })
  await expect(carrier).toBeVisible()
  await expect(row.locator('td[data-cell="platform"]')).not.toContainText(/Peron/, { useInnerText: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(carrier).toBeHidden()
  await expect(row.locator('td[data-cell="platform"]')).toContainText(/Peron/)
})

test('karta wiersza przy szerszym telefonie (600 px): ten sam układ — status pod pociągiem, godzina po prawej', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 812 })
  await firstBoardTime(page, STATION)
  const { time, direction, status, train } = await firstRowBoxes(page)
  expect(time.x).toBeGreaterThanOrEqual(direction.x + direction.width - 1)
  expect(status.y).toBeGreaterThanOrEqual(train.y + train.height - 1)
})

test('karta wiersza 400–600 px: kierunek ma co najmniej 120 px, także obok długiej plakietki', async ({ page }) => {
  await firstBoardTime(page, STATION)
  for (const width of [400, 480, 520, 600]) {
    await page.setViewportSize({ width, height: 812 })
    const widths = await page
      .locator('.board-table tbody tr[data-status] td[data-cell="direction"]')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))
    expect(Math.min(...widths), `${width} px`).toBeGreaterThanOrEqual(120)
  }
})

test('wczytywanie na telefonie: szkielet na pełną szerokość tablicy, bez pustej ramki karty nad nim', async ({ page }) => {
  await page.route('**/api/board**', () => {}) // bez odpowiedzi: tablica zostaje w stanie wczytywania
  await page.goto(STATION)
  const skeleton = page.getByTestId('skeleton-row').first()
  await expect(skeleton).toBeVisible({ timeout: READY })
  const table = (await page.locator('.board-table').boundingBox())!
  expect((await skeleton.locator('div').boundingBox())!.width).toBeGreaterThanOrEqual(table.width - 2)
  const loadingRow = page.locator('.board-table tbody tr').first()
  expect((await loadingRow.boundingBox())?.height ?? 0, 'wiersz „Wczytywanie…” nie rysuje karty').toBeLessThanOrEqual(2)
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
  const row = [page.getByRole('link', { name: 'Wróć do Startu' }), heading, page.getByRole('button', { name: 'Przypnij do Startu' }), page.getByRole('button', { name: 'Więcej' })]
  const boxes = await Promise.all(row.map((locator) => locator.boundingBox()))
  for (const box of boxes) expect(Math.abs(box!.y + box!.height / 2 - (boxes[0]!.y + boxes[0]!.height / 2)), 'jeden górny rząd').toBeLessThanOrEqual(12)
  await page.getByRole('button', { name: 'Więcej' }).click()
  const menu = page.getByRole('list', { name: 'Więcej' })
  await expect(menu.getByRole('button', { name: 'Udostępnij' })).toBeVisible()
  await menu.getByRole('button', { name: 'Informacje o stacji' }).click()
  await expect(page.getByRole('dialog', { name: 'Informacje o stacji' })).toBeVisible()
})

test('selektor kierunku pod paskiem zakładek: filtruje i ustawia ?direction=', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const select = page.getByRole('combobox', { name: 'Kierunek' })
  await expect(select).toHaveValue('')
  const tabs = (await page.getByTestId('board-tabs-bar').boundingBox())!
  const selectBox = (await select.boundingBox())!
  expect(selectBox.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1)
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

test('„Info” = modalny arkusz: kolejność sekcji, blokada tła i przewijania, Escape zamyka i oddaje fokus', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const info = page.getByRole('button', { name: 'Info' })
  // Klawiaturą: Safari nie fokusuje przycisku po kliknięciu, więc fokus nie miałby dokąd wrócić.
  await info.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Informacje o stacji' })
  await expect(sheet).toBeVisible()
  // Brief §8: utrudnienia → statystyki (zwinięte) → pogoda → mapa (zwinięta, gdy znamy lokalizację) → legenda.
  await expect(sheet.getByRole('button', { name: 'Mapa', exact: true })).toBeVisible({ timeout: READY })
  expect(await sheet.getByRole('heading', { level: 3 }).allTextContents()).toEqual([
    'Utrudnienia na tej stacji',
    'Statystyki stacji dzisiaj',
    'Pogoda dziś — Warszawa Centralna',
    'Mapa',
    'Legenda statusów',
  ])
  await expect(sheet.getByText('Odjazdy dzisiaj')).toHaveCount(0)
  await expect(page.getByRole('region', { name: /^Mapa stacji/ })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Statystyki stacji dzisiaj' }).click()
  await expect(sheet.getByText('Odjazdy dzisiaj')).toBeVisible()

  // Modal: arkusz nad dolnym paskiem, tło zablokowane (punkt nad zakładkami trafia w dialog), strona nie przewija się.
  // Tło jest `inert` pod modalem — lokatory CSS, nie role (drzewo dostępności go nie pokazuje).
  const nav = (await page.locator('nav[aria-label="Nawigacja główna"]').boundingBox())!
  const box = (await sheet.boundingBox())!
  expect(box.y + box.height).toBeGreaterThan(nav.y)
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
  const tab = (await page.locator('[role="tab"]', { hasText: 'Odjazdy' }).boundingBox())!
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('dialog') !== null, [tab.x + 5, tab.y + 5])).toBe(true)

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])

  await page.keyboard.press('Escape')
  // Odmontowany, nie tylko ukryty (zamknięty `<dialog>` w DOM-ie też nie ma roli) — i stan przycisku nadąża.
  await expect(page.getByRole('dialog', { name: 'Informacje o stacji', includeHidden: true })).toHaveCount(0)
  await expect(info).toHaveAttribute('aria-expanded', 'false')
  await expect(info).toBeFocused()
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
})

test('„Info” przystanku: linie, natężenie, mapa (w tej kolejności); × zamyka', async ({ page }) => {
  await page.goto(STOP)
  await page.getByRole('button', { name: 'Info' }).click()
  const sheet = page.getByRole('dialog', { name: 'Informacje o przystanku' })
  await expect(sheet.getByRole('heading', { name: 'Natężenie ruchu dziś' })).toBeAttached({ timeout: READY })
  await expect(sheet.getByRole('heading', { name: 'Linie w tym zespole' })).toBeAttached()
  // Brief §8: linie → natężenie (zwinięte) → mapa (zwinięta, leniwa) — mapa na końcu.
  await expect(sheet.getByRole('button', { name: 'Mapa', exact: true })).toBeVisible({ timeout: READY })
  expect(await sheet.getByRole('heading', { level: 3 }).allTextContents()).toEqual(['Linie w tym zespole', 'Natężenie ruchu dziś', 'Mapa'])
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

// PR4 „Tablica stacji”: powiadomienie o utrudnieniach, „Na mapie”, podpisy godziny, kontrast w obu motywach.
test.describe('tablica stacji na telefonie (PR4)', () => {
  const NOTICE = /utrudnie.* na stacji/

  test('powiadomienie o utrudnieniach: nad zakładkami, otwiera „Informacje o stacji” od utrudnień, Escape oddaje fokus', async ({ page }) => {
    await firstBoardTime(page, STATION)
    const notice = page.getByRole('button', { name: NOTICE })
    await expect(notice).toBeVisible({ timeout: READY })
    await expect(notice).toHaveAttribute('aria-haspopup', 'dialog')
    const noticeBox = (await notice.boundingBox())!
    const tabs = (await page.getByTestId('board-tabs-bar').boundingBox())!
    expect(noticeBox.y + noticeBox.height, 'powiadomienie nad paskiem zakładek').toBeLessThanOrEqual(tabs.y)

    const sheet = page.getByRole('dialog', { name: 'Informacje o stacji' })
    // Klik przed hydracją przepada bez śladu (jak w `showBoardContext`).
    await expect(async () => {
      if ((await notice.getAttribute('aria-expanded')) !== 'true') await notice.click()
      await expect(sheet).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: READY })
    await expect(sheet.getByRole('heading', { level: 3 }).first()).toHaveText('Utrudnienia na tej stacji')

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Informacje o stacji', includeHidden: true })).toHaveCount(0)
    await expect(notice).toBeFocused()
  })

  test('„Na mapie” to link do mapy z at=, działa też bez pogody', async ({ page }) => {
    await page.route('**/api/weather**', (route) => route.abort())
    await firstBoardTime(page, STATION)
    const link = page.getByRole('link', { name: 'Na mapie' })
    await expect(link).toBeVisible({ timeout: READY })
    const href = (await link.getAttribute('href'))!
    expect(href).toContain('at=')
    expect(href).toContain('/map')
    expect((await link.boundingBox())!.height, 'cel dotyku').toBeGreaterThanOrEqual(44)
  })

  test('stacja bez współrzędnych: tekst „Brak lokalizacji stacji” zamiast linku', async ({ page }) => {
    await page.route('**/api/rail-stations/list**', (route) => route.fulfill({ json: { stations: [] } }))
    await firstBoardTime(page, STATION)
    await expect(page.getByText('Brak lokalizacji stacji')).toBeVisible({ timeout: READY })
    await expect(page.getByRole('link', { name: 'Na mapie' })).toHaveCount(0)
  })

  test('320×640: długi kierunek zawija się, bez przewijania w bok, kierunek ma ≥ 100 px', async ({ page }) => {
    await page.route('**/api/board**', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      for (const snapshot of body.snapshots ?? []) {
        if (snapshot === null) continue
        for (const row of [...snapshot.departures, ...snapshot.arrivals]) row.headsign = 'Zielona Góra Główna przez Bardzo Długą Nazwę Stacji Pośredniej Testowej'
      }
      await route.fulfill({ response, json: body })
    })
    await page.setViewportSize({ width: 320, height: 640 })
    await firstBoardTime(page, STATION)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez przewijania w bok').toBe(true)
    const widths = await page
      .locator('.board-table tbody tr[data-status] td[data-cell="direction"]')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))
    expect(widths.length).toBeGreaterThan(0)
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(100)
  })

  test('podpisy godziny: potwierdzona = „Faktycznie” + „Plan HH:mm”, bez realizacji = „Plan” i nigdy „Faktycznie”', async ({ page }) => {
    await firstBoardTime(page, STATION)
    const all: string[] = []
    for (const tab of ['Odjazdy', 'Przyjazdy']) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
      await expect(boardRows(page).first()).toBeVisible()
      all.push(...(await boardRows(page).locator('td[data-cell="time"]').allInnerTexts()))
    }
    const planLine = /Plan \d{2}:\d{2}/
    const facts = all.filter((text) => text.includes('Faktycznie'))
    // Wiersz bez realizacji: sama godzina planu, podpis „Plan”, bez małej linii „Plan HH:mm” (nie ma czego porównywać).
    const planOnly = all.filter((text) => !planLine.test(text))
    expect(facts.length, 'mock ma potwierdzone pociągi').toBeGreaterThan(0)
    for (const text of facts) expect(text).toMatch(planLine)
    expect(planOnly.length, 'mock ma wiersz bez realizacji').toBeGreaterThan(0)
    for (const text of planOnly) {
      expect(text).toMatch(/(^|\n)Plan(\n|$)/)
      expect(text).not.toContain('Faktycznie')
      expect(text).not.toContain('Przew.')
    }
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`a11y: tablica stacji w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} bez naruszeń serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await firstBoardTime(page, STATION)
      await expect(page.getByRole('button', { name: NOTICE })).toBeVisible({ timeout: READY })
      const { violations } = await scanA11y(page)
      const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
    })
  }
})
