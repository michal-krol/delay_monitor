import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Mock „Centrum" (zespół 1001) = 4 słupki (AGENTS.md #13, patrz gtfs-slupek.spec.ts).
const CENTRUM = '/city/warszawa/stop/1001'
// Mock ma prawdziwe ID: Warszawa Centralna 33605 (AGENTS.md #8).
const STATION_BOARD = '/station/33605?name=Warszawa%20Centralna'

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s) — strona sama ponawia.
const READY = 45_000

/**
 * Regresja: pin+atrybucja renderują się nawet gdy kafelki OpenFreeMap nigdy
 * się nie wczytają (transform ustawiany synchronicznie z `center`/`zoom` przy
 * `new Map()`, niezależnie od workera/sieci) -- `toHaveCount`/`toBeVisible`
 * na pinie/regionie NIE łapią więc realnej awarii rysowania (zaobserwowane:
 * pusty worker URL w buildzie produkcyjnym, MapView.tsx). Screenshot
 * canvasu to jedyny sygnał na poziomie kompozytora, nie surowego bufora WebGL
 * (`toDataURL`/`readPixels` bez `preserveDrawingBuffer` potrafią zwrócić
 * przezroczysty odczyt mimo poprawnego rysowania -- nie duplikuj tej pułapki).
 * Pusty/jednokolorowy canvas kompresuje się do PNG rzędu ~1-3 KB; prawdziwe
 * kafelki (ulice, etykiety, budynki) rzędu dziesiątek KB -- próg 8 KB ma
 * bezpieczny margines w obie strony.
 */
async function expectTilesRendered(canvas: Locator): Promise<void> {
  await expect(async () => {
    const png = await canvas.screenshot()
    expect(png.byteLength, 'canvas zbyt mały PNG -- prawdopodobnie puste kafelki').toBeGreaterThan(8_000)
  }).toPass({ timeout: 15_000 })
}

test('przystanek miejski: mapa pokazuje jeden pin na słupek i steruje przełącznikiem', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()

  const map = page.getByRole('region', { name: /^Mapa przystanku/ })
  await expect(map).toBeVisible({ timeout: READY })
  await expect(page.locator('.maplibregl-marker')).toHaveCount(4)
  await expectTilesRendered(map.locator('canvas'))

  // Klik na pin steruje TYM SAMYM przełącznikiem słupka co karty poniżej (MapView.tsx: onPinClick).
  await page.locator('.maplibregl-marker').first().click()
  await expect(page.getByRole('tab', { name: /^Centrum 0\d/, selected: true })).toBeVisible()
})

test('przystanek miejski: „Powiększ mapę" otwiera pełnoekranowy widok z podglądem odjazdów w popupie', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByRole('region', { name: /^Mapa przystanku/ })).toBeVisible({ timeout: READY })

  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  const dialog = page.getByRole('dialog', { name: /^Mapa przystanku/ })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.maplibregl-marker')).toHaveCount(4)
  await expectTilesRendered(dialog.locator('canvas'))

  // Powiększony popup ma podgląd odjazdów tego słupka -- mini nie (za mało miejsca).
  await dialog.locator('.maplibregl-marker').first().click()
  await expect(page.locator('.maplibregl-popup-content').getByText(/^\d{2}:\d{2} →/).first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('przystanek miejski: kliknięcie tła zamyka pełnoekranową mapę', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByRole('region', { name: /^Mapa przystanku/ })).toBeVisible({ timeout: READY })
  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  const dialog = page.getByRole('dialog', { name: /^Mapa przystanku/ })
  await expect(dialog).toBeVisible()

  // Dialog ma margines (inset-4 / sm:inset-10) -- róg viewportu to samo tło.
  await page.mouse.click(3, 3)
  await expect(dialog).not.toBeVisible()
})

test('przystanek miejski: Tab w pełnoekranowej mapie nie ucieka poza dialog', async ({ page, browserName }) => {
  // WebKit domyślnie pomija przyciski w kolejności Tab (Full Keyboard Access).
  test.skip(browserName === 'webkit', 'Tab w Safari zależy od ustawień systemu')
  await page.goto(CENTRUM)
  await expect(page.getByRole('region', { name: /^Mapa przystanku/ })).toBeVisible({ timeout: READY })
  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  const dialog = page.getByRole('dialog', { name: /^Mapa przystanku/ })
  await expect(dialog).toBeVisible()
  // MapLibre przebudowuje atrybucję (`replaceChildren`, nowe linki) za każdym razem, gdy używane
  // źródło stylu dołoży swoją -- fokusowany link znika i fokus spada na body. Sam „MapLibre" to
  // PIERWSZA wersja (flaky 2026-09-29: przebudowa ~250 ms po tej bramce, 3/30 porażek);
  // „OpenStreetMap" przychodzi w ostatniej, a identyczny HTML MapLibre pomija (`_updateAttributions`).
  await expectTilesRendered(dialog.locator('canvas'))
  await expect(dialog.getByRole('link', { name: /OpenStreetMap/ })).toBeVisible()

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    const active = await page.evaluate(() => ({
      inside: document.activeElement?.closest('[role="dialog"]') != null,
      el: document.activeElement?.outerHTML.slice(0, 120),
    }))
    expect(active.inside, `Tab #${i + 1} wyszedł poza dialog: ${active.el}`).toBe(true)
  }
})

test('przystanek miejski: zablokowane kafelki nie psują strony (piny i reszta widoku żyją)', async ({ page }) => {
  await page.route('**/tiles.openfreemap.org/**', (route) => route.abort())
  await page.goto(CENTRUM)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()
  await expect(page.locator('.maplibregl-marker')).toHaveCount(4, { timeout: READY })
  await expect(page.getByRole('tab', { name: /^Centrum 0\d/ }).first()).toBeVisible()
})

test('stacja PKP: mapa lokalizacji pokazuje jeden pin po wczytaniu pogody (ten sam fetch, zero nowego zapytania)', async ({
  page,
}) => {
  await page.goto(STATION_BOARD)

  // Karta pogody istnieje od razu (nagłówek statyczny) — na pin czekamy dopiero
  // po realnym zwrocie /api/weather (available:true + location), nie po samym mount.
  await expect(page.getByText(/°C/)).toBeVisible({ timeout: 20_000 })

  const map = page.getByRole('region', { name: 'Mapa stacji Warszawa Centralna' })
  await expect(map).toBeVisible()
  await expect(page.locator('.maplibregl-marker')).toHaveCount(1)
  await expectTilesRendered(map.locator('canvas'))
})

test('a11y: przystanek miejski z mapą bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

test('a11y: przystanek miejski z mapą w trybie ciemnym bez naruszeń serious/critical', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(CENTRUM)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

test('a11y: powiększona mapa (dialog) bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })
  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  await expect(page.getByRole('dialog').locator('.maplibregl-marker').first()).toBeVisible()

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

// Mock: linia 20 ma 2 pojazdy (fixtures/gtfs/warszawa/vehicles.json, side_number 380x) -- patrz gtfs-vehicles.spec.ts.
const LINE_20 = '/city/warszawa/line/20'

test('linia: mapa trasy rysuje piny przystanków i pojazdy, klik pinu wybiera przystanek', async ({ page }) => {
  await page.goto(LINE_20)
  const map = page.getByRole('region', { name: 'Mapa trasy linii 20' })
  await expect(map).toBeVisible({ timeout: READY })
  await expectTilesRendered(map.locator('canvas'))
  // Pojazdy z tego samego pollingu co karta „Pojazdy w trasie" (zero nowych zapytań).
  await expect(map.getByTestId('map-mover').first()).toBeVisible({ timeout: READY })

  const stopPins = map.locator('.maplibregl-marker:not([data-testid="map-mover"])')
  const count = await stopPins.count()
  expect(count).toBeGreaterThanOrEqual(2)
  // Lista przystanków trasy: dokładnie jeden przycisk `aria-pressed` (wybrany). Domyślnie pierwszy.
  const selected = page.locator('ol button[aria-pressed="true"]')
  const before = await selected.innerText()
  await stopPins.nth(1).click()
  await expect(selected).not.toHaveText(before)
})

test('a11y: strona linii z mapą trasy bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(LINE_20)
  await expect(page.getByRole('region', { name: 'Mapa trasy linii 20' })).toBeVisible({ timeout: READY })
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

// Mock rebases operatingDate do dzisiejszej daty warszawskiej (mock.ts,
// warsawDateString) -- ta sama formuła tu, żeby URL trafił w rebase'owany fixture.
function warsawToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
}

// Mock: pociąg 104 w trasie, ~6h opóźnienia, realne stacje (Gdańsk Główny 7500...) -- AGENTS.md #8.
const TRAIN_104 = `/connection/2026/104/${warsawToday()}`
// Mock: pociąg 107, trainStatus 'S', jeszcze nie wyjechał -- AGENTS.md #8.
const TRAIN_107 = `/connection/2026/107/${warsawToday()}`

test('połączenie: mapa trasy rysuje piny i marker pozycji dla pociągu w trasie', async ({ page }) => {
  await page.goto(TRAIN_104)
  const mapSection = page.locator('section', { has: page.getByRole('heading', { name: 'Mapa trasy' }) })
  await expect(mapSection).toBeVisible({ timeout: READY })
  await expectTilesRendered(mapSection.locator('canvas'))
  // Nie samo ".maplibregl-marker" (to liczy też piny stacji) -- konkretnie
  // marker POZYCJI, ten sam testid co mover linii (LINE_20, AGENTS.md #6).
  await expect(mapSection.getByTestId('map-mover')).toHaveCount(1)
})

test('połączenie: mapa nie pokazuje zmyślonej pozycji dla pociągu, który jeszcze nie wyjechał (107)', async ({ page }) => {
  await page.goto(TRAIN_107)
  // Bez `if (isVisible())` -- to nie czeka i prawie zawsze pomija sprawdzenie
  // tuż po nawigacji, zanim fetch /api/train w ogóle wróci. Obie stacje 107
  // mają współrzędne (AGENTS.md #8), więc mapa się renderuje; asercja
  // niedopuszczalności zmyślonego markera musi faktycznie się wykonać.
  const mapSection = page.locator('section', { has: page.getByRole('heading', { name: 'Mapa trasy' }) })
  await expect(mapSection).toBeVisible({ timeout: READY })
  await expectTilesRendered(mapSection.locator('canvas'))
  await expect(mapSection.getByTestId('map-mover')).toHaveCount(0)
})

test('a11y: strona połączenia z mapą trasy bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(TRAIN_104)
  await expect(page.getByRole('heading', { name: 'Mapa trasy' })).toBeVisible({ timeout: READY })
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

// Każda mapa `MapView` w obu motywach (PR 6: ciemny podkład, piny w kolorze rodzaju, kontrolki `glass`).
// Mapa stacji siedzi w bocznym panelu, na telefonie ukrytym — stąd `toBeAttached`, nie `toBeVisible`.
for (const colorScheme of ['light', 'dark'] as const) {
  for (const [name, path, ready] of [
    ['linii', LINE_20, 'Mapa trasy linii 20'],
    ['połączenia', TRAIN_104, 'Mapa trasy pociągu'],
    ['stacji', STATION_BOARD, 'Mapa stacji'],
  ] as const) {
    if (colorScheme === 'light' && name !== 'stacji') continue // jasne skany linii i połączenia są wyżej
    test(`a11y: mapa ${name} w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} bez naruszeń serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto(path)
      await expect(page.getByRole('region', { name: new RegExp(`^${ready}`) }).locator('.maplibregl-marker').first()).toBeAttached({ timeout: READY })
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
    })
  }
}

// Mapa transportu (refaktor 2026-09-26): kolej z całej Polski + przystanki
// i pojazdy miasta jako warstwy WebGL. Obiekty na canvasie nie są fokusowalne —
// ścieżką klawiatury i testów jest wyszukiwarka → karta (MapCard).
const CITY_MAP = '/city/warszawa/map'
const MAP_NAME = 'Mapa transportu — Warszawa'

async function openMap(page: Page, path = CITY_MAP): Promise<Locator> {
  await page.goto(path)
  const map = page.getByRole('region', { name: MAP_NAME })
  await expect(map).toBeVisible({ timeout: READY })
  return map
}

/** Na telefonie dwa pola wyszukiwania są zakładkami (spec §20). */
async function lineSearch(page: Page): Promise<Locator> {
  const tab = page.getByRole('group', { name: 'Czego szukasz' }).getByRole('button', { name: 'Linia' })
  if (await tab.isVisible()) await tab.click()
  return page.getByRole('combobox', { name: 'Szukaj linii' })
}

async function expectNoBlockingA11y(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
}

test('mapa transportu: renderuje kafelki, pasek wyszukiwania, filtry i legendę', async ({ page }) => {
  const map = await openMap(page)
  await expectTilesRendered(map)
  await expect(page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Filtry/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Przybliż' })).toBeVisible()
  await expect(page.getByText('Legenda')).toBeVisible()
  await expect(page.getByText(/pozycje pojazdów:/)).toBeVisible({ timeout: READY })
})

test.describe('niski telefon (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  // Legenda rośnie w górę od dołu mapy; bez limitu wysokości jej nagłówek („Legenda” = jedyne
  // zwinięcie) chował się pod przyklejonym nagłówkiem strony (podlegenda rodzajów autobusów, +110 px).
  test('mapa transportu: rozwinięta legenda mieści się w mapie i daje się zwinąć', async ({ page }) => {
    const map = await openMap(page)
    const legend = page.locator('details', { has: page.getByText('Legenda', { exact: true }) })
    await legend.getByText('Legenda', { exact: true }).click()
    await expect(legend).toHaveAttribute('open', '')
    const [mapBox, legendBox] = [await map.boundingBox(), await legend.boundingBox()]
    expect(legendBox!.y).toBeGreaterThanOrEqual(mapBox!.y)
    expect(legendBox!.y + legendBox!.height).toBeLessThanOrEqual(mapBox!.y + mapBox!.height)
    await legend.getByText('Legenda', { exact: true }).click()
    await expect(legend).not.toHaveAttribute('open', '')
  })
})

test('mapa transportu: wyszukanie stacji otwiera kartę z linkiem do pełnej tablicy, Escape ją zamyka', async ({ page }) => {
  await openMap(page)
  await page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }).fill('Centralna')
  await page.getByRole('option', { name: 'Warszawa Centralna' }).click()
  const card = page.getByRole('dialog', { name: 'Warszawa Centralna' })
  await expect(card).toBeVisible()
  await expect(card.getByRole('link', { name: /Pełna tablica/ })).toHaveAttribute('href', '/station/33605')
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
})

test('mapa transportu: wyszukanie przystanku miejskiego pokazuje rozkład, nie „na czas"', async ({ page }) => {
  await openMap(page)
  await page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }).fill('Centrum')
  await page.getByRole('option', { name: 'Centrum' }).first().click()
  const card = page.getByRole('dialog', { name: 'Centrum' })
  await expect(card).toBeVisible()
  await expect(card.getByText(/rozkład/)).toBeVisible()
  await expect(card.getByText(/na czas/)).toHaveCount(0)
})

test('mapa transportu: wybór linii filtruje pojazdy — chip i URL, „×" wraca do wszystkich', async ({ page }) => {
  await openMap(page)
  await (await lineSearch(page)).fill('20')
  await page.getByRole('option', { name: /^Linia 20/ }).click()
  await expect(page).toHaveURL(/[?&]line=20/)
  const chips = page.getByRole('list', { name: 'Aktywne filtry' })
  await expect(chips.getByText('Linia 20')).toBeVisible()
  await chips.getByRole('button', { name: /Pokaż wszystkie linie/ }).click()
  await expect(page).not.toHaveURL(/[?&]line=/)
})

test('mapa transportu: tryb linii — panel z przebiegiem, zmiana kierunku w URL-u, „×" kończy tryb', async ({ page }) => {
  await openMap(page)
  await (await lineSearch(page)).fill('20')
  await page.getByRole('option', { name: /^Linia 20/ }).click()
  const panel = page.getByRole('dialog', { name: 'Linia 20' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('list').getByRole('button').first()).toBeVisible({ timeout: READY })
  const switchDirection = panel.getByRole('button', { name: 'Zmień kierunek' })
  if (await switchDirection.isVisible()) {
    await switchDirection.click()
    await expect(page).toHaveURL(/[?&]dir=1/)
  }
  await panel.getByRole('button', { name: 'Zakończ tryb linii' }).click()
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]line=/)
})

test('mapa transportu: filtr warstwy zapisuje się w URL-u i pokazuje chip ograniczenia', async ({ page }) => {
  await openMap(page)
  await page.getByRole('button', { name: /Filtry/ }).click()
  await page.getByRole('checkbox', { name: /Przystanki autobusowe/ }).uncheck()
  await expect(page).toHaveURL(/[?&]hide=busStops/)
  await page.keyboard.press('Escape')
  const chips = page.getByRole('list', { name: 'Aktywne filtry' })
  await chips.getByRole('button', { name: 'Pokaż: przystanki autobusowe' }).click()
  await expect(page).not.toHaveURL(/[?&]hide=/)
})

test('mapa transportu: stare linki (?vehicles=0&rail=0) dalej działają jako filtry', async ({ page }) => {
  await openMap(page, `${CITY_MAP}?vehicles=0&rail=0`)
  const chips = page.getByRole('list', { name: 'Aktywne filtry' })
  await expect(chips.getByText('Ukryte: stacje kolejowe')).toBeVisible()
  await expect(chips.getByText('Ukryte: tramwaje')).toBeVisible()
})

test('mapa transportu: awaria pozycji pojazdów to komunikat, a mapa kolei i przystanków żyje dalej', async ({ page }) => {
  await page.route('**/api/gtfs/city-vehicles**', (route) => route.abort())
  const map = await openMap(page)
  await expect(page.getByText(/nie udało się pobrać pozycji pojazdów/)).toBeVisible({ timeout: READY })
  await expectTilesRendered(map)
})

test('mapa transportu: „Lista" pokazuje obiekty w kadrze, „Co jest w pobliżu?" działa z klawiatury', async ({ page }) => {
  await openMap(page, `${CITY_MAP}?at=52.23000,21.00800,15.0`)
  await page.getByRole('button', { name: 'Lista' }).click()
  const list = page.getByRole('dialog', { name: 'W widoku' })
  // Śródmieście mieści się w kadrze także na telefonie (Centralna już nie).
  const station = list.getByRole('button', { name: 'Warszawa Śródmieście', exact: true })
  await expect(station).toBeVisible({ timeout: READY })
  await station.click()
  const card = page.getByRole('dialog', { name: 'Warszawa Śródmieście' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Co jest w pobliżu?' }).click()
  const nearby = page.getByRole('dialog', { name: 'W pobliżu' })
  await expect(nearby.getByRole('button', { name: /Warszawa Śródmieście/ }).first()).toBeVisible()
})

test('mapa transportu: gwiazdka w karcie przypina do Pulpitu, co widać potem w menu', async ({ page }) => {
  await openMap(page)
  await page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }).fill('Centralna')
  await page.getByRole('option', { name: 'Warszawa Centralna' }).click()
  await page.getByRole('dialog', { name: 'Warszawa Centralna' }).getByRole('button', { name: 'Przypnij do Pulpitu' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Przypięte' }).click()
  await expect(page.getByRole('list', { name: 'Przypięte' }).getByRole('button', { name: 'Warszawa Centralna' })).toBeVisible()
})

test('a11y: mapa transportu bez naruszeń serious/critical', async ({ page }) => {
  await openMap(page)
  await expectNoBlockingA11y(page)
})

test('a11y: mapa transportu w trybie ciemnym i z otwartą kartą bez naruszeń serious/critical', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openMap(page)
  await page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }).fill('Centralna')
  await page.getByRole('option', { name: 'Warszawa Centralna' }).click()
  await expect(page.getByRole('dialog', { name: 'Warszawa Centralna' })).toBeVisible()
  await expectNoBlockingA11y(page)
})
