import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { showBoardContext } from './helpers/info'

// Mock „Centrum" (zespół 1001) = 4 przystanki (AGENTS.md #13, patrz gtfs-stop-member.spec.ts).
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

test('przystanek miejski: mapa pokazuje jeden pin na przystanek i steruje przełącznikiem', async ({ page }) => {
  await page.goto(CENTRUM)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()

  const map = page.getByRole('region', { name: /^Mapa (zespołu przystanków|przystanku)/ })
  await expect(map).toBeVisible({ timeout: READY })
  await expect(page.locator('.maplibregl-marker')).toHaveCount(4)
  await expectTilesRendered(map.locator('canvas'))

  // Klik na pin steruje TYM SAMYM przełącznikiem przystanku co karty poniżej (MapView.tsx: onPinClick).
  await page.locator('.maplibregl-marker').first().click()
  await expect(page.getByRole('tab', { name: /^Centrum 0\d/, selected: true })).toBeVisible()
})

test('przystanek miejski: „Powiększ mapę" otwiera pełnoekranowy widok z podglądem odjazdów w popupie', async ({ page }) => {
  await page.goto(CENTRUM)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
  await expect(page.getByRole('region', { name: /^Mapa (zespołu przystanków|przystanku)/ })).toBeVisible({ timeout: READY })

  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  const dialog = page.getByRole('dialog', { name: /^Mapa (zespołu przystanków|przystanku)/ })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.maplibregl-marker')).toHaveCount(4)
  await expectTilesRendered(dialog.locator('canvas'))

  // Powiększony popup ma podgląd odjazdów tego przystanku -- mini nie (za mało miejsca).
  await dialog.locator('.maplibregl-marker').first().click()
  await expect(page.locator('.maplibregl-popup-content').getByText(/^\d{2}:\d{2} →/).first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('przystanek miejski: kliknięcie tła zamyka pełnoekranową mapę', async ({ page }) => {
  await page.goto(CENTRUM)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
  await expect(page.getByRole('region', { name: /^Mapa (zespołu przystanków|przystanku)/ })).toBeVisible({ timeout: READY })
  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  const dialog = page.getByRole('dialog', { name: /^Mapa (zespołu przystanków|przystanku)/ })
  await expect(dialog).toBeVisible()

  // Dialog ma margines (inset-4 / sm:inset-10) -- róg viewportu to samo tło.
  await page.mouse.click(3, 3)
  await expect(dialog).not.toBeVisible()
})

test('przystanek miejski: Tab w pełnoekranowej mapie nie ucieka poza dialog', async ({ page, browserName }) => {
  // WebKit domyślnie pomija przyciski w kolejności Tab (Full Keyboard Access).
  test.skip(browserName === 'webkit', 'Tab w Safari zależy od ustawień systemu')
  await page.goto(CENTRUM)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
  await expect(page.getByRole('region', { name: /^Mapa (zespołu przystanków|przystanku)/ })).toBeVisible({ timeout: READY })
  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  const dialog = page.getByRole('dialog', { name: /^Mapa (zespołu przystanków|przystanku)/ })
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
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()
  await expect(page.locator('.maplibregl-marker')).toHaveCount(4, { timeout: READY })
  await expect(page.getByRole('tab', { name: /^Centrum 0\d/ }).first()).toBeVisible()
})

test('stacja PKP: mapa lokalizacji pokazuje jeden pin po wczytaniu pogody (ten sam fetch, zero nowego zapytania)', async ({
  page,
}) => {
  await page.goto(STATION_BOARD)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)

  // Karta pogody istnieje od razu (nagłówek statyczny) — na pin czekamy dopiero
  // po zwrocie /api/weather (available:true + location), nie po samym mount. Pogodę serwuje
  // `WEATHER_DATA_SOURCE=mock` (playwright.config.ts) — zero ruchu do Open-Meteo; jedyny
  // zewnętrzny ruch to kafelki OpenFreeMap (świadomy wyjątek, AGENTS.md #6).
  await expect(page.getByText(/°C/)).toBeVisible({ timeout: 20_000 })

  const map = page.getByRole('region', { name: 'Mapa stacji Warszawa Centralna' })
  await expect(map).toBeVisible()
  await expect(page.locator('.maplibregl-marker')).toHaveCount(1)
  await expectTilesRendered(map.locator('canvas'))
})

test('a11y: przystanek miejski z mapą bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

test('a11y: przystanek miejski z mapą w trybie ciemnym bez naruszeń serious/critical', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(CENTRUM)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

test('a11y: powiększona mapa (dialog) bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await showBoardContext(page) // telefon: mapa w arkuszu „Info” (PR4)
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
// Mapa stacji siedzi w bocznym panelu; na telefonie w arkuszu „Info” (PR4) — stąd `showBoardContext`.
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
      if (path === STATION_BOARD) await showBoardContext(page)
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

/** Na telefonie „Lista” i „Udostępnij” są w menu „Więcej” (PR3); na desktopie to zwykłe przyciski. */
async function moreItem(page: Page, name: string): Promise<Locator> {
  const more = page.getByRole('button', { name: 'Więcej' })
  if (await more.isVisible()) {
    await more.click()
    return page.getByRole('list', { name: 'Więcej' }).getByRole('button', { name })
  }
  return page.getByRole('button', { name, exact: true })
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

function intersects(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * Rozwinięta legenda zostaje w mapie, nie zasłania kontrolek w prawym górnym rogu (zoom MapLibre,
 * „Pokaż całe miasto”) i daje się zwinąć. Legenda rośnie w górę od dołu mapy: bez limitu wysokości
 * jej nagłówek („Legenda” = jedyne zwinięcie) chował się pod przyklejonym nagłówkiem strony
 * (podlegenda rodzajów autobusów, +110 px), a z limitem od `top-3` przykrywała kontrolki rogu.
 */
async function expectExpandedLegendFits(page: Page): Promise<void> {
  const map = await openMap(page)
  const legend = page.locator('details', { has: page.getByText('Legenda', { exact: true }) })
  await legend.getByText('Legenda', { exact: true }).click()
  await expect(legend).toHaveAttribute('open', '')
  const [mapBox, legendBox] = [await map.boundingBox(), await legend.boundingBox()]
  expect(legendBox!.y).toBeGreaterThanOrEqual(mapBox!.y)
  expect(legendBox!.y + legendBox!.height).toBeLessThanOrEqual(mapBox!.y + mapBox!.height)
  for (const control of [page.getByRole('button', { name: 'Przybliż' }), page.getByRole('button', { name: /^Pokaż całe miasto/ })]) {
    await expect(control).toBeVisible()
    const controlBox = await control.boundingBox()
    expect(intersects(legendBox!, controlBox!), `legenda zasłania ${await control.getAttribute('aria-label')}`).toBe(false)
  }
  await legend.getByText('Legenda', { exact: true }).click()
  await expect(legend).not.toHaveAttribute('open', '')
}

test.describe('niski telefon (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('mapa transportu: rozwinięta legenda mieści się w mapie i daje się zwinąć', async ({ page }) => {
    await expectExpandedLegendFits(page)
  })
})

test.describe('niski desktop (800×600)', () => {
  test.use({ viewport: { width: 800, height: 600 } })

  test('mapa transportu: rozwinięta legenda nie zasłania przybliżania ani „Pokaż całe miasto”', async ({ page }) => {
    await expectExpandedLegendFits(page)
  })
})

// Regresja (QA staging 2026-10-01): na 375 px przyciski zeszły do drugiego rzędu, a rozwinięta
// legenda zaczynała się na 144 px i zakrywała ich dół. Od PR3 w rzędzie są Filtry i „Więcej”.
test.describe('mapa transportu: rozwinięta legenda pod przyciskami w drugim rzędzie', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'pomiar przy setViewportSize na desktop-chromium; mobile ma własny viewport')
  })

  test('375×812: dolny środek każdego przycisku trafia w przycisk, nie w legendę', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openMap(page)
    const legend = page.locator('details', { has: page.getByText('Legenda', { exact: true }) })
    await legend.getByText('Legenda', { exact: true }).click()
    await expect(legend).toHaveAttribute('open', '')
    for (const button of [page.getByRole('button', { name: /Filtry/ }), page.getByRole('button', { name: 'Więcej' })]) {
      const box = (await button.boundingBox())!
      // 1 px nad krawędzią: sam brzeg (`y + height`) należy już do elementu pod spodem.
      const hit = await button.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height - 1])
      expect(hit, `legenda zasłania dół przycisku ${await button.textContent() || await button.getAttribute('aria-label')}`).toBe(true)
    }
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
  await (await moreItem(page, 'Lista')).click()
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

// Regresja (QA 2026-09-30): na 375 px pole wyszukiwania dzieliło rząd z przyciskami
// (Lista, Filtry, Udostępnij ≈ 224 px) i kurczyło się do ~75 px („Sz…").
test.describe('mapa transportu: szerokość pola wyszukiwania', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'pomiar przy setViewportSize na desktop-chromium; mobile ma własny viewport')
  })

  test('375 px: pola miejsca i linii mają co najmniej 280 px, strona nie przewija się w poziomie', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openMap(page)
    const place = await page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }).boundingBox()
    expect(place!.width).toBeGreaterThanOrEqual(280)
    const line = await (await lineSearch(page)).boundingBox()
    expect(line!.width).toBeGreaterThanOrEqual(280)
    // Przyciski zostają przy prawej krawędzi: panele „Filtry"/„Więcej" (`right-0`) otwierają się w lewo,
    // przy przyciskach z lewej wyjeżdżały ~100 px poza ekran.
    const more = await page.getByRole('button', { name: 'Więcej' }).boundingBox()
    expect(more!.x + more!.width).toBeCloseTo(line!.x + line!.width, 0)
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('375×812: kontrolki zajmują dwa rzędy — zakładki z przyciskami, pod nimi pole', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openMap(page)
    const top = async (locator: Locator) => (await locator.boundingBox())!.y
    const center = async (locator: Locator) => {
      const box = (await locator.boundingBox())!
      return box.y + box.height / 2
    }
    const tabs = page.getByRole('group', { name: 'Czego szukasz' })
    const tabsCenter = await center(tabs)
    expect(await center(page.getByRole('button', { name: /Filtry/ }))).toBeCloseTo(tabsCenter, 0)
    expect(await center(page.getByRole('button', { name: 'Więcej' }))).toBeCloseTo(tabsCenter, 0)
    expect(await top(page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' })) - (await top(tabs))).toBeLessThan(60)
  })

  // CI 2026-10-01 (mobile-safari, iPhone 15): przyciski w drugim rzędzie zepchnęły chip linii
  // pod kartę na dole (max 62% mapy), „×" w chipie przestało dać się kliknąć.
  test('393×659: karta linii nie zakrywa chipów filtrów', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 })
    await openMap(page)
    await (await lineSearch(page)).fill('20')
    await page.getByRole('option', { name: /^Linia 20/ }).click()
    const chips = await page.getByRole('list', { name: 'Aktywne filtry' }).boundingBox()
    const card = await page.getByRole('dialog').boundingBox()
    expect(card!.y).toBeGreaterThanOrEqual(chips!.y + chips!.height)
  })

  test('1280 px: oba pola i przyciski zostają w jednym rzędzie', async ({ page }) => {
    await openMap(page)
    const top = async (locator: Locator) => (await locator.boundingBox())!.y
    const row = await top(page.getByRole('button', { name: 'Lista' }))
    expect(await top(page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }))).toBeCloseTo(row, 0)
    expect(await top(page.getByRole('combobox', { name: 'Szukaj linii' }))).toBeCloseTo(row, 0)
  })
})

/**
 * Przeciągnięcie jednym palcem przez CDP (`Input.dispatchTouchEvent`) — prawdziwe wejście
 * dotykowe w Chromium, z przewijaniem i dociąganiem do punktów scroll-snap. Tylko Chromium:
 * WebKit w Playwright nie ma API dotyku (gest na iOS = click-QA na urządzeniu).
 */
async function touchDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * i) / 10, y: from.y + (dy * i) / 10 }] })
    await page.waitForTimeout(8)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

// PR3: na telefonie karty mapy leżą w arkuszu od dołu z trzema punktami (BottomSheet.tsx).
test.describe('mapa transportu: arkusz na telefonie', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop-chromium', 'arkusz tylko poniżej sm; desktop ma panel obok mapy')
  })

  const sheet = (page: Page): Locator => page.locator('.bottom-sheet')

  /** Ułamki wysokości z `SHEET_SNAPS` (BottomSheet.tsx). */
  const SNAP_FRACTION = { peek: 0.25, half: 0.55, full: 0.9 } as const

  /**
   * Uchwyt przełącza `data-snap` od razu, a przewijanie jedzie płynnie jeszcze chwilę. Kolejny klik w trakcie
   * animacji to inny scenariusz (osobny test jednostkowy) — tu czekamy na dojazd, żeby test nie ścigał się
   * z animacją pod obciążeniem (flaky z PR3).
   */
  async function clickHandleTo(page: Page, snap: keyof typeof SNAP_FRACTION): Promise<void> {
    await page.getByRole('button', { name: /^Zmień wysokość panelu/ }).click()
    await expect(sheet(page)).toHaveAttribute('data-snap', snap)
    await expect
      .poll(() => sheet(page).evaluate((el, fraction) => Math.abs(el.scrollTop - fraction * el.clientHeight), SNAP_FRACTION[snap]), { message: `arkusz nie dojechał do „${snap}”` })
      .toBeLessThan(3)
  }

  async function openStopCard(page: Page, name: string, option: string | RegExp = name): Promise<Locator> {
    await page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }).fill(name)
    await page.getByRole('option', { name: option }).first().click()
    const card = page.getByRole('dialog', { name })
    await expect(card).toBeVisible()
    return card
  }

  for (const height of [812, 667]) {
    test(`375×${height}: strona mapy się nie przewija, mapa wypełnia ekran`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height })
      const map = await openMap(page)
      const { scrollHeight, innerHeight } = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      }))
      expect(scrollHeight).toBeLessThanOrEqual(innerHeight)
      // Przed PR3 przy 812 px: 70% (pełny TopBar ok. 135 px nad mapą).
      if (height === 812) expect((await map.boundingBox())!.height).toBeGreaterThanOrEqual(0.75 * height)
    })
  }

  test('karta przystanku otwiera się nisko (peek), uchwyt przełącza peek → połowa → pełny → peek', async ({ page }) => {
    const map = await openMap(page)
    const card = await openStopCard(page, 'Centrum')
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    // Fokus na nagłówku karty, widocznym nad dolnym paskiem już przy „peek”.
    const heading = card.getByRole('heading', { name: 'Centrum' })
    await expect(heading).toBeFocused()
    await expect(heading).toBeInViewport()
    expect((await heading.boundingBox())!.y + 20).toBeLessThan((await page.getByRole('navigation', { name: 'Nawigacja główna' }).boundingBox())!.y)
    const mapBox = (await map.boundingBox())!
    expect((await card.boundingBox())!.y - mapBox.y).toBeGreaterThanOrEqual(0.7 * mapBox.height)
    for (const snap of ['half', 'full', 'peek'] as const) await clickHandleTo(page, snap)
  })

  test('wyniki wyszukiwania i menu kontrolek leżą nad arkuszem, nie pod nim', async ({ page }) => {
    await openMap(page)
    await openStopCard(page, 'Centrum')
    await clickHandleTo(page, 'half')
    const onTop = async (locator: Locator): Promise<boolean> => {
      await locator.scrollIntoViewIfNeeded()
      const box = (await locator.boundingBox())!
      return locator.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height - 4])
    }
    await page.getByRole('button', { name: /Filtry/ }).click()
    const lastFilter = page.getByRole('button', { name: 'Pokaż wszystko' })
    await expect(lastFilter).toBeVisible()
    // Strona się nie przewija: panel Filtry przewija się sam i jego dół też jest osiągalny (iPhone 15, 659 px).
    expect(await onTop(lastFilter), 'panel Filtry pod arkuszem albo pod dolnym paskiem').toBe(true)
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' }).fill('Warszawa')
    const options = page.getByRole('option')
    await expect(options.last()).toBeVisible()
    expect(await onTop(options.last()), 'wyniki wyszukiwania pod arkuszem').toBe(true)
  })

  test('„×" w karcie zamyka arkusz', async ({ page }) => {
    await openMap(page)
    const card = await openStopCard(page, 'Centrum')
    await expect(sheet(page)).toHaveCount(1)
    await card.getByRole('button', { name: 'Zamknij kartę' }).click()
    await expect(sheet(page)).toHaveCount(0)
  })

  test('nowy panel przy pełnym arkuszu startuje znów nisko (peek)', async ({ page }) => {
    await openMap(page)
    const card = await openStopCard(page, 'Warszawa Centralna', 'Warszawa Centralna')
    for (const snap of ['half', 'full'] as const) await clickHandleTo(page, snap)
    await card.getByRole('button', { name: 'Co jest w pobliżu?' }).click()
    await expect(page.getByRole('dialog', { name: 'W pobliżu' })).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
  })

  // PR4 (decyzja z PR3): przy half/full arkusz zakrywał „Aktywne filtry” i komunikaty (role=status).
  // Teraz jadą na górnej krawędzi arkusza — widoczne i klikalne w każdym punkcie. Komunikat o awarii
  // stacji kolejowych, bo jest trwały; „Skopiowano link…” znika po kilku sekundach (flaky pod obciążeniem),
  // a oba idą tym samym stosem (`statusStack` w `map/page.tsx`).
  test('chipy filtrów i komunikaty statusu zostają nad arkuszem przy half i full', async ({ page }) => {
    await page.route('**/api/rail-stations/list**', (route) => route.abort())
    await openMap(page, `${CITY_MAP}?hide=busStops`)
    await openStopCard(page, 'Centrum')
    const chips = page.getByRole('list', { name: 'Aktywne filtry' })
    const problem = page.getByRole('status').filter({ hasText: 'Nie udało się wczytać stacji kolejowych — ponawiam.' })
    await expect(problem).toBeAttached({ timeout: READY })
    const uncovered = (locator: Locator) =>
      locator.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
      })
    // Przy „full” nad arkuszem zostaje ok. 55 px (iPhone 15): mieści się rząd najbliżej krawędzi —
    // status (ostatni w stosie); chipy wyżej mogą się uciąć (decyzja usera, PR4).
    for (const [snap, visible] of [['half', [chips, problem]], ['full', [problem]]] as const) {
      await clickHandleTo(page, snap)
      for (const locator of visible) {
        await expect(locator).toBeInViewport()
        expect(await uncovered(locator), `${snap}: zasłonięte`).toBe(true)
      }
    }
    await clickHandleTo(page, 'peek')
    await chips.getByRole('button', { name: 'Pokaż: przystanki autobusowe' }).click()
    await expect(page).not.toHaveURL(/[?&]hide=/)
  })

  test('pełny arkusz: treść panelu przewija się w środku, niższy — nie', async ({ page }) => {
    await openMap(page)
    await openStopCard(page, 'Centrum')
    const body = page.locator('.bottom-sheet [data-sheet-scroll]')
    await expect(body).toHaveCSS('overflow-y', 'hidden')
    for (const snap of ['half', 'full'] as const) await clickHandleTo(page, snap)
    await expect(body).toHaveCSS('overflow-y', 'auto')
  })

  test('dotyk: mapa nad arkuszem przesuwa się, przeciągnięcie arkusza zmienia punkt', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'dotyk przez CDP tylko w Chromium')
    const map = await openMap(page)
    await openStopCard(page, 'Centrum')
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    // Kamera po wyborze przystanku dojeżdża animacją — czekamy, aż `?at=` się ustali.
    await page.waitForTimeout(1500)
    const box = (await map.boundingBox())!
    const at = new URL(page.url()).searchParams.get('at')
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.45 }, 60, 120)
    await expect.poll(() => new URL(page.url()).searchParams.get('at')).not.toBe(at)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')

    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.9 }, 0, -250)
    await expect(sheet(page)).not.toHaveAttribute('data-snap', 'peek')
  })
})

// PR3: mała mapa w treści strony ma `cooperativeGestures` — jeden palec przewija stronę, nie mapę.
// Strona linii: jej mapa stoi w treści na każdej szerokości (mapa przystanku na telefonie jest od PR4 w arkuszu „Info”).
test('mała mapa ma polską podpowiedź gestów', async ({ page }) => {
  await page.goto(LINE_20)
  const map = page.getByRole('region', { name: 'Mapa trasy linii 20' })
  await expect(map).toBeVisible({ timeout: READY })
  await expect(page.locator('.maplibregl-cooperative-gesture-screen')).toContainText('dwoma palcami')
})

test('dotyk: przesunięcie jednym palcem nad małą mapą przewija stronę', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || testInfo.project.name === 'desktop-chromium', 'dotyk przez CDP — mobile-chromium')
  await page.goto(LINE_20)
  const map = page.getByRole('region', { name: 'Mapa trasy linii 20' })
  await expect(map).toBeVisible({ timeout: READY })
  await expect(page.locator('.maplibregl-cooperative-gesture-screen')).toHaveCount(1)
  await map.scrollIntoViewIfNeeded()
  const before = await page.evaluate(() => window.scrollY)
  const box = (await map.boundingBox())!
  await touchDrag(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.7 }, 0, -150)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 50)
})
