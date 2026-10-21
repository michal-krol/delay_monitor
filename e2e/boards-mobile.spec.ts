import { test, expect, type Locator, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { scrollToStopMap, showBoardContext } from './helpers/info'

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
  // Godzina pierwszego wiersza (dominująca) nad paskiem; znaczniki pod nią mogą zejść — dwa pełne wiersze mierzy test 375×812.
  await expectAboveNav(page, page.getByRole('tabpanel').getByTestId('departure-list').locator('li time').first())
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
  await page.getByRole('tab', { name: 'Rozkład' }).click()
  await expect(page.getByTestId('departure-list').locator('li').nth(20)).toBeAttached({ timeout: READY })
  await page.evaluate(() => window.scrollBy(0, 600))
  const bar = page.getByTestId('stop-tabs-bar')
  await expect(bar).toBeInViewport()
  await expect(page.getByRole('tab', { name: 'Rozkład' })).toBeInViewport()
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

test('stacja: powrót i opcje w nagłówku, jedna nazwa h1 i dostępne Info', async ({ page }) => {
  await firstBoardTime(page, STATION)
  const heading = page.getByRole('heading', { name: 'Warszawa Centralna' })
  await expect(heading).toHaveCount(1)
  await expect(page.getByRole('navigation', { name: 'Ścieżka nawigacji' })).toHaveCount(0)
  await expect(page.getByTestId('station-stats')).toHaveCount(0)
  const row = [page.getByRole('link', { name: 'Wróć do Startu' }).filter({ visible: true }), page.getByRole('button', { name: 'Więcej opcji strony' }).filter({ visible: true })]
  const boxes = await Promise.all(row.map((locator) => locator.boundingBox()))
  for (const box of boxes) expect(Math.abs(box!.y + box!.height / 2 - (boxes[0]!.y + boxes[0]!.height / 2)), 'jeden górny rząd').toBeLessThanOrEqual(12)
  await page.getByRole('button', { name: 'Więcej opcji strony' }).filter({ visible: true }).click()
  const menu = page.getByRole('list', { name: 'Więcej' })
  await expect(menu.getByRole('button', { name: 'Udostępnij' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Info', exact: true }).click()
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

test('„Info” przystanku: KPI, linie, natężenie (mapa stoi pod odjazdami, nie w arkuszu); × zamyka', async ({ page }) => {
  await page.goto(STOP)
  await page.getByRole('button', { name: 'Info' }).click()
  const sheet = page.getByRole('dialog', { name: 'Informacje o przystanku' })
  await expect(sheet.getByRole('heading', { name: 'Natężenie ruchu dziś' })).toBeAttached({ timeout: READY })
  await expect(sheet.getByRole('heading', { name: 'Linie w tym zespole' })).toBeAttached()
  // Spec 04: mapa podglądowa jest w głównym przepływie pod odjazdami — w arkuszu jej nie ma (jedno miejsce naraz).
  await expect(sheet.getByText('Odjazdy dziś')).toBeVisible({ timeout: READY })
  expect(await sheet.getByRole('heading', { level: 3 }).allTextContents()).toEqual(['Linie w tym zespole', 'Natężenie ruchu dziś'])
  await expect(sheet.getByRole('region', { name: /^Mapa/ })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Zamknij informacje' }).click()
  await expect(sheet).toHaveCount(0)
})

test('a11y: przystanek na telefonie (chipy, przyklejony pasek) bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(STOP)
  await expect(page.getByRole('tab', { name: 'Odjazdy' })).toBeVisible({ timeout: READY })
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

// PR5 „Połączenie kolejowe”: nagłówek bez przewijania, skrót długiej trasy, podpisy plan/prognoza/fakt,
// szacowana pozycja, ponowienie po błędzie, a11y w obu motywach. Mock pociągu 104 ma tylko 3 przystanki, więc
// scenariusze długiej trasy podstawiają odpowiedź `/api/train` (kształt `TrainDetailApiResponse`).
test.describe('połączenie na telefonie (PR5)', () => {
  /** Mock rebase'uje `operatingDate` do dzisiejszej daty warszawskiej (jak w `map.spec.ts`). */
  const warsawToday = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
  const TRAIN_104 = `/connection/2026/104/${warsawToday()}?train=TLK%2058102`
  const TRAIN_107 = `/connection/2026/107/${warsawToday()}`
  const TRAIN_503 = 'Chwilowo zbyt wiele zapytań o szczegóły połączeń. Spróbuj ponownie za kilka minut.'
  const ROUTE_LIST = 'Przebieg trasy'
  const MINUTE = 60_000

  /** 14 przystanków; ostatni potwierdzony = indeks 5, okno skróconej trasy = indeksy 5–7. Czasy względem „teraz”. */
  function longRouteBody(): Record<string, unknown> {
    const base = Math.floor(Date.now() / MINUTE) * MINUTE
    const iso = (offsetMin: number): string => new Date(base + offsetMin * MINUTE).toISOString()
    const names = ['Gdynia Główna', 'Sopot', 'Gdańsk Główny', 'Tczew', 'Malbork', 'Elbląg', 'Iława', 'Działdowo', 'Mława', 'Ciechanów', 'Nasielsk', 'Legionowo', 'Warszawa Wschodnia', 'Warszawa Centralna']
    const last = names.length - 1
    const stops = names.map((stationName, i) => {
      const departure = (i - 5) * 12 - 3 // minuty względem „teraz”; przystanek 5 odjechał 3 min temu
      const plannedDeparture = i === last ? null : iso(departure)
      const plannedArrival = i === 0 ? null : iso(departure - 1)
      const confirmed = i <= 5
      const cancelled = i === 8
      const stop = {
        stationId: i === last ? '33605' : String(10001 + i),
        stationName,
        plannedArrival,
        actualArrival: confirmed && i > 0 ? iso(departure + 1) : null,
        arrivalDelayMinutes: confirmed && i > 0 ? 2 : null,
        plannedDeparture,
        actualDeparture: confirmed && i !== last ? iso(departure + 2) : null,
        departureDelayMinutes: confirmed && i !== last ? 3 : null,
        isCancelled: cancelled,
        isConfirmed: confirmed,
        platform: null as string | null,
        track: null as string | null,
        hasTrainStarted: i <= 8,
        estimatedDelayMinutes: !confirmed && !cancelled && i <= 8 ? 3 : null,
        predictedArrival: null as string | null,
        predictedDeparture: null as string | null,
        disruptionMessages: [] as string[],
        stopMinutes: i === 0 || i === last ? null : 1,
        stopTypeName: null,
        lat: null,
        lon: null,
      }
      // Przystanek 6: PKP przewiduje godzinę (niepotwierdzony) → „Przew.”.
      if (i === 6) return { ...stop, predictedArrival: iso(departure + 3), predictedDeparture: iso(departure + 4), platform: '1', track: '2' }
      // Przystanek 7: `actual*` = kopia planu bez `isConfirmed` (AGENTS.md #2) → nigdy „Faktycznie”.
      if (i === 7) return { ...stop, actualArrival: plannedArrival, actualDeparture: plannedDeparture }
      if (i === 0) return { ...stop, platform: '2', track: '4' }
      if (i === 10) return { ...stop, platform: '3' }
      if (i === 11) return { ...stop, track: '5' }
      return stop
    })
    return {
      scheduleId: '2026',
      orderId: '104',
      operatingDate: warsawToday(),
      trainStatus: 'P',
      carrierCode: 'IC',
      carrierName: 'PKP Intercity',
      category: 'TLK',
      categoryName: 'Twoje Linie Kolejowe',
      routeName: null,
      nationalNumber: '58102',
      stops,
    }
  }

  type TrainApi = { requests: number; fail: boolean; hold: Promise<unknown> | null }

  /** Podstawia `/api/train` (body = null → odpowiada mock), liczy żądania; `fail` = 503, `hold` wstrzymuje odpowiedź. */
  async function stubTrain(page: Page, body: Record<string, unknown> | null): Promise<TrainApi> {
    const api: TrainApi = { requests: 0, fail: false, hold: null }
    await page.route(/\/api\/train\?/, async (route) => {
      api.requests++
      if (api.hold !== null) await api.hold
      if (api.fail) return route.fulfill({ status: 503, json: { error: TRAIN_503 } })
      if (body === null) return route.fallback()
      return route.fulfill({ json: body })
    })
    return api
  }

  const routeList = (page: Page): Locator => page.getByRole('list', { name: ROUTE_LIST })
  const routeRows = (page: Page): Locator => routeList(page).getByRole('listitem')
  const row = (page: Page, name: string): Locator => routeRows(page).filter({ hasText: name })
  const showAll = (page: Page): Locator => page.getByRole('button', { name: /^Pokaż całą trasę/ })
  const noHorizontalScroll = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

  /** Dwie klatki: ewentualne żądanie wywołane kliknięciem zdążyłoby już dotrzeć do `page.route`. */
  const settleFrames = (page: Page): Promise<unknown> =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  async function openLongRoute(page: Page): Promise<TrainApi> {
    const api = await stubTrain(page, longRouteBody())
    await page.goto(TRAIN_104)
    await expect(showAll(page)).toBeVisible({ timeout: READY })
    return api
  }

  async function expandRoute(page: Page): Promise<void> {
    await showAll(page).click()
    await expect(routeRows(page)).toHaveCount(14)
  }

  test('375×812: tytuł, relacja i pierwszy przystanek widać bez przewijania nad dolnym paskiem', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(TRAIN_104)
    // Najpierw dane: w stanie ładowania nie ma jeszcze relacji ani wierszy trasy (wcześniej test bywał migoczący).
    await expect(routeRows(page).first()).toBeVisible({ timeout: READY })
    const title = page.getByRole('heading', { level: 1 })
    const relation = page.locator('header p').filter({ has: page.getByRole('img', { name: 'do', exact: true }) })
    await expectAboveNav(page, title)
    await expectAboveNav(page, relation)
    await expectAboveNav(page, routeRows(page).first())
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('bez poziomego przewijania: mock 104 w 320 px, długa trasa rozwinięta w 320 i 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(TRAIN_104)
    await expect(routeRows(page).first()).toBeVisible({ timeout: READY })
    expect(await noHorizontalScroll(page), 'mock 104, 320 px').toBe(true)

    await stubTrain(page, longRouteBody())
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 640 })
      await page.goto(TRAIN_104)
      await expandRoute(page)
      expect(await noHorizontalScroll(page), `długa trasa, ${width} px`).toBe(true)
    }
  })

  test('długa trasa: tylko okno wierszy, „Pokaż całą trasę (14 przystanków)” rozwija i zwija bez żadnego zapytania do /api/train', async ({ page }) => {
    const api = await openLongRoute(page)
    await expect(routeRows(page)).toHaveCount(3)
    const button = showAll(page)
    await expect(button).toHaveText('Pokaż całą trasę (14 przystanków)')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    const before = api.requests
    expect(before).toBeGreaterThan(0)

    await button.click()
    await expect(routeRows(page)).toHaveCount(14)
    const collapse = page.getByRole('button', { name: 'Zwiń trasę' })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await settleFrames(page)
    expect(api.requests, 'rozwinięcie nie pobiera danych (#3)').toBe(before)

    await collapse.click()
    await expect(routeRows(page)).toHaveCount(3)
    await settleFrames(page)
    expect(api.requests, 'zwinięcie nie pobiera danych (#3)').toBe(before)
  })

  test('klawiatura: Enter i Spacja na przycisku trasy rozwijają i zwijają listę', async ({ page }) => {
    await openLongRoute(page)
    const button = showAll(page)
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(routeRows(page)).toHaveCount(14)
    const collapse = page.getByRole('button', { name: 'Zwiń trasę' })
    await expect(collapse).toBeFocused()
    await page.keyboard.press('Space')
    await expect(routeRows(page)).toHaveCount(3)
    await expect(showAll(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('podpisy godzin: potwierdzony = „Faktycznie” + „Plan HH:mm”, prognoza = „Przew.”, kopia planu bez potwierdzenia = „Plan”, odwołany = „odwołany”', async ({ page }) => {
    await openLongRoute(page)
    // Okno skróconej trasy: ostatni potwierdzony (Elbląg), prognoza (Iława), kopia planu (Działdowo).
    await expect(row(page, 'Elbląg')).toContainText('Faktycznie')
    await expect(row(page, 'Elbląg')).toContainText(/Plan \d{2}:\d{2}/)
    await expect(row(page, 'Iława')).toContainText('Przew.')
    await expect(row(page, 'Iława')).not.toContainText('Faktycznie')
    // Tekst bez białych znaków między węzłami: „22:05Plan…” = podpis „Plan”, a nie „Plan 22:05” (mała linia planu).
    await expect(row(page, 'Działdowo')).toContainText(/\d{2}:\d{2}Plan(?! \d)/)
    await expect(row(page, 'Działdowo')).not.toContainText('Faktycznie')
    await expect(row(page, 'Działdowo')).not.toContainText('Przew.')

    await expandRoute(page)
    await expect(row(page, 'Mława')).toContainText(/odwołany/i)
    // Niepotwierdzony przystanek bez `actual*` i prognozy: sam plan.
    await expect(row(page, 'Ciechanów')).not.toContainText('Faktycznie')
    // Tylko potwierdzone przystanki mówią „Faktycznie”: 0–5.
    await expect(routeRows(page).filter({ hasText: 'Faktycznie' })).toHaveCount(6)
  })

  test('peron i tor: „Peron N · tor M”, sam „Peron N”, sam „Tor M”, a przystanek bez obu nie pokazuje żadnego z nich', async ({ page }) => {
    await openLongRoute(page)
    await expandRoute(page)
    await expect(row(page, 'Gdynia Główna')).toContainText('Peron 2 · tor 4')
    await expect(row(page, 'Nasielsk')).toContainText('Peron 3')
    await expect(row(page, 'Nasielsk')).not.toContainText(/\b[Tt]or\b/)
    await expect(row(page, 'Legionowo')).toContainText('Tor 5')
    await expect(row(page, 'Legionowo')).not.toContainText('Peron')
    await expect(row(page, 'Sopot')).not.toContainText(/Peron|\b[Tt]or\b/)
  })

  test('stacja → połączenie → rozwiń trasę → przystanek → Wstecz wraca do połączenia', async ({ page }) => {
    await stubTrain(page, longRouteBody())
    await page.goto(STATION)
    const rowButton = page.locator('td button[aria-label]').first()
    await expect(async () => {
      await page.reload()
      await expect(rowButton).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: READY })
    await rowButton.click()
    await expect(page).toHaveURL(/\/connection\//)
    await expandRoute(page)

    await routeList(page).getByRole('link', { name: /Warszawa Centralna/ }).click()
    await expect(page).toHaveURL(/\/station\/33605/)
    await page.goBack()
    await expect(page).toHaveURL(/\/connection\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })
  })

  test('deep link bez historii: „Wróć do tablicy” prowadzi na Start', async ({ page }) => {
    await page.goto(TRAIN_104)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })
    const back = page.getByRole('button', { name: 'Wróć do tablicy' })
    // Klik przed hydracją przepada bez śladu (jak w `showBoardContext`).
    await expect(async () => {
      if (new URL(page.url()).pathname.startsWith('/connection/')) await back.click()
      await expect(page).toHaveURL(/\/$/, { timeout: 2_000 })
    }).toPass({ timeout: READY })
  })

  test('pozycja szacowana: podpis „Szacowana pozycja”, bez „Live”/„na żywo”/„GPS” (poza „nie GPS”); pociąg 107 bez markera i podpisu', async ({ page }) => {
    // Marker pozycji to element DOM, kafelki nie są potrzebne (zero sieci).
    await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
    await page.goto(TRAIN_104)
    const map = page.locator('section', { has: page.getByRole('heading', { name: 'Mapa trasy' }) })
    await expect(map).toBeVisible({ timeout: READY })
    await expect(map.getByTestId('map-mover')).toHaveCount(1)
    const caption = map.getByText('Szacowana pozycja')
    await expect(caption).toBeVisible()
    const text = (await map.innerText()).replaceAll('nie GPS', '')
    expect(text).not.toMatch(/live|na żywo|gps/i)

    await page.goto(TRAIN_107)
    await expect(map).toBeVisible({ timeout: READY })
    await expect(map.getByTestId('map-mover')).toHaveCount(0)
    await expect(map.getByText('Szacowana pozycja')).toHaveCount(0)
  })

  test('pierwsze pobranie nie powiodło się: komunikat serwera, „Spróbuj ponownie” i „Szukaj stacji”; ponowienie pokazuje trasę', async ({ page }) => {
    const api = await stubTrain(page, null)
    api.fail = true
    await page.goto(TRAIN_104)
    const message = page.getByText(TRAIN_503, { exact: true })
    await expect(message).toBeVisible({ timeout: READY })
    await expect(page.getByRole('link', { name: 'Szukaj stacji' })).toHaveAttribute('href', '/search')
    const retry = page.getByRole('button', { name: 'Spróbuj ponownie' })
    await expect(retry).toBeVisible()
    await expect(routeRows(page)).toHaveCount(0)

    api.fail = false
    await retry.click()
    await expect(routeRows(page).first()).toBeVisible({ timeout: READY })
    await expect(message).toHaveCount(0)
  })

  test('wiek danych: na gotowej stronie „Pobrano … temu”', async ({ page }) => {
    await page.goto(TRAIN_104)
    await expect(page.getByTestId('data-age')).toHaveText(/^Pobrano /, { timeout: READY })
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    const label = colorScheme === 'dark' ? 'ciemnym' : 'jasnym'

    async function expectNoBlocking(page: Page): Promise<void> {
      await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme))
      const { violations } = await scanA11y(page)
      const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
    }

    test.describe(`a11y w trybie ${label}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.addInitScript((value) => window.localStorage.setItem('theme', value), colorScheme)
      })

      test('rozwinięta długa trasa bez naruszeń serious/critical', async ({ page }) => {
        await openLongRoute(page)
        await expandRoute(page)
        await expect(page).toHaveTitle(/.+/)
        await expectNoBlocking(page)
      })

      test('wczytywanie (szkielet) bez naruszeń serious/critical', async ({ page }) => {
        const api = await stubTrain(page, longRouteBody())
        let release!: () => void
        api.hold = new Promise<void>((resolve) => (release = resolve))
        await page.goto(TRAIN_104)
        await expect(page.getByTestId('connection-loading')).toHaveAttribute('aria-busy', 'true', { timeout: READY })
        await expect(page).toHaveTitle(/.+/)
        await expectNoBlocking(page)
        release()
        await expect(routeRows(page).first()).toBeVisible({ timeout: READY })
      })

      test('błąd pierwszego pobrania bez naruszeń serious/critical', async ({ page }) => {
        const api = await stubTrain(page, null)
        api.fail = true
        await page.goto(TRAIN_104)
        await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible({ timeout: READY })
        await expect(page).toHaveTitle(/.+/)
        await expectNoBlocking(page)
      })
    })
  }

  test('a11y: ciemny motyw z ograniczonym ruchem, rozwinięta trasa, bez naruszeń serious/critical', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'))
    await openLongRoute(page)
    await expandRoute(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    const { violations } = await scanA11y(page)
    const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
  })
})

// PR6 „04 Przystanek”: odjazdy przed mapą, URL tab/line, 320 px bez przewijania w bok, axe w obu motywach.
test.describe('przystanek miejski na telefonie (PR6)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('375×812: dwa pierwsze odjazdy nad dolnym paskiem, mapa (≤ 180 px) dopiero pod listą', async ({ page }) => {
    await page.goto(STOP)
    const rows = page.getByRole('tabpanel').getByTestId('departure-list').locator('li')
    await expectAboveNav(page, rows.nth(1))
    const map = page.getByRole('region', { name: /^Mapa zespołu przystanków/ })
    // Mapa montuje się leniwie (IntersectionObserver) — region istnieje po przewinięciu do sekcji.
    await scrollToStopMap(page)
    await expect(map).toBeAttached({ timeout: READY })
    const mapBox = (await map.boundingBox())!
    const panelBox = (await page.getByRole('tabpanel').boundingBox())!
    expect(mapBox.y, 'mapa po odjazdach').toBeGreaterThanOrEqual(panelBox.y + panelBox.height)
    expect(mapBox.height).toBeLessThanOrEqual(180)
  })

  test('320×640: cztery zakładki w układzie 2×2, bez przewijania w bok', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(STOP)
    const tabs = page.getByRole('tablist', { name: 'Widok przystanku' }).getByRole('tab')
    await expect(tabs).toHaveCount(4, { timeout: READY })
    const boxes = await tabs.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })))
    expect(new Set(boxes.map((b) => Math.round(b.y))).size, 'dwa rzędy').toBe(2)
    expect(boxes[0].y).toBe(boxes[1].y)
    expect(boxes[0].x).toBeLessThan(boxes[1].x)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez przewijania w bok').toBe(true)
  })

  test('zakładka i filtr linii są w URL i przeżywają przeładowanie oraz Wstecz z linii', async ({ page }) => {
    await page.goto(STOP)
    await page.getByRole('tab', { name: 'Linie' }).click({ timeout: READY })
    await expect(page).toHaveURL(/tab=lines/)
    await page.getByRole('tab', { name: 'Odjazdy' }).click()
    await expect(page).not.toHaveURL(/tab=/)
    await page.getByRole('group', { name: 'Filtr linii' }).getByRole('button', { name: /^20/ }).click()
    await expect(page).toHaveURL(/line=20/)
    await page.reload()
    await expect(page.getByRole('group', { name: 'Filtr linii' }).getByRole('button', { name: /^20/ })).toHaveAttribute('aria-pressed', 'true', { timeout: READY })

    await page.getByRole('tab', { name: 'Linie' }).click()
    await page.getByRole('tabpanel').getByRole('link', { name: /^Linia 20/ }).first().click()
    await expect(page).toHaveURL(/\/city\/warszawa\/line\/20/)
    await page.goBack()
    await expect(page.getByRole('tab', { name: 'Linie' })).toHaveAttribute('aria-selected', 'true', { timeout: READY })
    await expect(page).toHaveURL(/line=20/)
  })

  test('zły ?tab= i ?line= są ignorowane po cichu', async ({ page }) => {
    await page.goto(`${STOP}?tab=zzz&line=../../x`)
    await expect(page.getByRole('tab', { name: 'Odjazdy' })).toHaveAttribute('aria-selected', 'true', { timeout: READY })
    await expect(page.getByRole('button', { name: 'Wszystkie', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('skrót „N komunikatów” nad odjazdami otwiera zakładkę Komunikaty', async ({ page }) => {
    await page.goto(STOP)
    const notice = page.getByRole('button', { name: /^\d+ komunikat/ })
    await expect(notice).toBeVisible({ timeout: READY })
    await notice.click()
    await expect(page.getByRole('tab', { name: /Komunikaty/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: /Komunikaty linii obsługujących ten zespół/ })).toBeVisible()
  })

  test('„Na mapie” prowadzi do mapy miasta z at=, bez GPS', async ({ page }) => {
    await page.goto(STOP)
    const link = page.getByRole('link', { name: 'Na mapie' })
    await expect(link).toBeVisible({ timeout: READY })
    expect(await link.getAttribute('href')).toMatch(/^\/city\/warszawa\/map\?at=52\.\d+,21\.\d+,14\.0$/)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`a11y: przystanek w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} (zakładki, powiadomienie, mapa) bez naruszeń serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto(STOP)
      await expect(page.getByRole('button', { name: /^\d+ komunikat/ })).toBeVisible({ timeout: READY })
      await scrollToStopMap(page)
      await expect(page.getByRole('region', { name: /^Mapa zespołu przystanków/ })).toBeAttached({ timeout: READY })
      const { violations } = await scanA11y(page)
      const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
    })
  }
})
