import { changeTheme } from './helpers/page-options'
import { test, expect, type Locator, type Page } from './helpers/test'
import { scanA11y } from './helpers/axe'
import { showBoardMap } from './helpers/info'
import { CITY_MAP, RAIL_ROW, READY, STOP_ROW, expectNoBlockingA11y, geolocationCalls, isPhone, lineRow, mapSearch, openMap, openVisibleList, pickResult, searchResults, stubGeolocation } from './helpers/map'

// Mock „Centrum" (zespół 1001) = 4 przystanki (AGENTS.md #13, patrz gtfs-stop-member.spec.ts).
const CENTRUM = '/city/warszawa/stop/1001'
// Mock ma prawdziwe ID: Warszawa Centralna 33605 (AGENTS.md #8).
const STATION_BOARD = '/station/33605?name=Warszawa%20Centralna'

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
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
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
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
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
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
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
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
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
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()
  await expect(page.locator('.maplibregl-marker')).toHaveCount(4, { timeout: READY })
  await expect(page.getByRole('tab', { name: /^Centrum 0\d/ }).first()).toBeVisible()
})

test('stacja PKP: mapa lokalizacji pokazuje jeden pin po wczytaniu pogody (ten sam fetch, zero nowego zapytania)', async ({
  page,
}) => {
  await page.goto(STATION_BOARD)
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)

  // Karta pogody istnieje od razu (nagłówek statyczny) — na pin czekamy dopiero
  // po zwrocie /api/weather (available:true + location), nie po samym mount. Pogodę serwuje
  // `WEATHER_DATA_SOURCE=mock` (playwright.config.ts) — zero ruchu do Open-Meteo; jedyny
  // zewnętrzny ruch to kafelki OpenFreeMap (świadomy wyjątek, AGENTS.md #6).
  await expect(page.getByRole('button', { name: /^Pogoda: .*°C/ }).filter({ visible: true })).toBeVisible({ timeout: 20_000 })

  const map = page.getByRole('region', { name: 'Mapa stacji Warszawa Centralna' })
  await expect(map).toBeVisible()
  await expect(page.locator('.maplibregl-marker')).toHaveCount(1)
  await expectTilesRendered(map.locator('canvas'))
})

test('a11y: przystanek miejski z mapą bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

test('a11y: przystanek miejski z mapą w trybie ciemnym bez naruszeń serious/critical', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(CENTRUM)
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

test('a11y: powiększona mapa (dialog) bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await showBoardMap(page) // telefon: stacja — zwinięta sekcja „Mapa” w „Info” (PR5); przystanek — mapa pod odjazdami (PR6)
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({ timeout: READY })
  await page.getByRole('button', { name: 'Powiększ mapę' }).click()
  await expect(page.getByRole('dialog').locator('.maplibregl-marker').first()).toBeVisible()

  const { violations } = await scanA11y(page)
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
  const { violations } = await scanA11y(page)
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
  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

// Każda mapa `MapView` w obu motywach (PR 6: ciemny podkład, piny w kolorze rodzaju, kontrolki `glass`).
// Mapa stacji siedzi w bocznym panelu; na telefonie w zwiniętej sekcji arkusza „Info” (PR5) — stąd `showBoardMap`.
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
      if (path === STATION_BOARD) await showBoardMap(page)
      await expect(page.getByRole('region', { name: new RegExp(`^${ready}`) }).locator('.maplibregl-marker').first()).toBeAttached({ timeout: READY })
      const { violations } = await scanA11y(page)
      const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
    })
  }
}

// Mapa transportu (refaktor 2026-09-26): kolej z całej Polski + przystanki
// i pojazdy miasta jako warstwy WebGL. Obiekty na canvasie nie są fokusowalne —
// ścieżką klawiatury i testów jest wyszukiwarka → karta (MapCard).
// Wspólne helpery (`openMap`, `pickResult`, wiersze wyników…): `helpers/map.ts`.

test('mapa transportu: renderuje kafelki, pasek wyszukiwania, filtry i legendę', async ({ page }) => {
  const map = await openMap(page)
  await expectTilesRendered(map)
  await expect(mapSearch(page)).toBeVisible()
  await expect(page.getByRole('button', { name: /Filtry/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Przybliż' })).toBeVisible()
  // Telefon: kompaktowa legenda rodzajów w arkuszu przeglądu; od `sm` pełna, zwijana legenda przy mapie.
  if (isPhone(page)) await expect(page.getByRole('list', { name: 'Legenda rodzajów' })).toBeVisible()
  else await expect(page.getByText('Legenda', { exact: true })).toBeVisible()
  // Nagłówek mówi, KIEDY przeglądarka pobrała odczyt (wiek GPS pojazdów jest osobno, w arkuszu przeglądu).
  await expect(page.getByText(/Warszawa · pobrano /)).toBeVisible({ timeout: READY })
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
  for (const control of [page.getByRole('button', { name: 'Przybliż' }), page.getByRole('button', { name: /^Pokaż całe miasto/ }), page.getByRole('button', { name: 'Moja lokalizacja' })]) {
    await expect(control).toBeVisible()
    const controlBox = await control.boundingBox()
    expect(intersects(legendBox!, controlBox!), `legenda zasłania ${await control.getAttribute('aria-label')}`).toBe(false)
  }
  await legend.getByText('Legenda', { exact: true }).click()
  await expect(legend).not.toHaveAttribute('open', '')
}

// Od PR10 pełna, zwijana legenda jest tylko od `sm`; telefon ma kompaktową w arkuszu przeglądu (`peek`).
test.describe('niski telefon (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('mapa transportu: arkusz przeglądu (peek) mieści się w mapie i nie zasłania „Moja lokalizacja"', async ({ page }) => {
    const map = await openMap(page)
    const overview = page.getByRole('region', { name: 'Pojazdy i przystanki w widoku' })
    await expect(overview).toBeVisible()
    await expect(page.getByText('Legenda', { exact: true })).toHaveCount(0)
    const [mapBox, sheetBox] = [await map.boundingBox(), await page.locator('.bottom-sheet').boundingBox()]
    expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(mapBox!.y + mapBox!.height + 1)
    const locate = page.getByRole('button', { name: 'Moja lokalizacja' })
    await expect(locate).toBeVisible()
    const box = (await locate.boundingBox())!
    // Przycisk jedzie w slocie `above` arkusza: środek trafia w przycisk, nie w panel pod nim.
    expect(await locate.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true)
  })
})

test.describe('niski desktop (800×600)', () => {
  test.use({ viewport: { width: 800, height: 600 } })

  test('mapa transportu: rozwinięta legenda nie zasłania przybliżania, „Pokaż całe miasto” ani „Moja lokalizacja”', async ({ page }) => {
    await expectExpandedLegendFits(page)
  })
})

// Regresja (QA staging 2026-10-01): na 375 px przyciski zeszły do drugiego rzędu, a rozwinięta legenda zakrywała ich dół.
// Od PR10 telefon nie ma zwijanej legendy, ale pod „Lista"/„Filtry"/czipami wciąż nic nie może leżeć (arkusz startuje od 25 % mapy).
test.describe('mapa transportu: nic nie zakrywa przycisków i czipów pod polem wyszukiwania', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'pomiar przy setViewportSize na desktop-chromium; mobile ma własny viewport')
  })

  test('375×812: dolny środek „Lista", „Filtry" i czipów trafia w nie same, nie w arkusz', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openMap(page)
    const chips = page.getByRole('group', { name: 'Rodzaje pojazdów' }).getByRole('button')
    await expect(chips.first()).toBeVisible({ timeout: READY })
    for (const button of [page.getByRole('button', { name: 'Lista', exact: true }), page.getByRole('button', { name: /Filtry/ }), chips.first()]) {
      const box = (await button.boundingBox())!
      // 1 px nad krawędzią: sam brzeg (`y + height`) należy już do elementu pod spodem.
      const hit = await button.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height - 1])
      expect(hit, `coś zasłania dół przycisku ${(await button.textContent()) || (await button.getAttribute('aria-label'))}`).toBe(true)
    }
  })
})

test('mapa transportu: wyszukanie stacji otwiera kartę z linkiem do pełnej tablicy, Escape ją zamyka', async ({ page }) => {
  await openMap(page)
  await pickResult(page, 'Centralna', RAIL_ROW)
  const card = page.getByRole('dialog', { name: 'Warszawa Centralna' })
  await expect(card).toBeVisible()
  await expect(mapSearch(page)).toHaveValue('') // wybór czyści pole i zostaje na mapie
  await expect(page).toHaveURL(/\/city\/warszawa\/map/)
  await expect(card.getByRole('link', { name: /Pełna tablica/ })).toHaveAttribute('href', '/station/33605')
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
})

test('mapa transportu: wyszukanie przystanku miejskiego pokazuje rozkład, nie „na czas"', async ({ page }) => {
  await openMap(page)
  await pickResult(page, 'Centrum', STOP_ROW)
  const card = page.getByRole('dialog', { name: 'Centrum' })
  await expect(card).toBeVisible()
  await expect(card.getByText(/rozkład/).first()).toBeVisible()
  await expect(card.getByText(/na czas/)).toHaveCount(0)
})

test('mapa transportu: wybór linii filtruje pojazdy — chip i URL, „×" wraca do wszystkich', async ({ page }) => {
  await openMap(page)
  await pickResult(page, '20', lineRow('20'))
  await expect(page).toHaveURL(/[?&]line=20/)
  const chips = page.getByRole('list', { name: 'Aktywne filtry' })
  await expect(chips.getByText('Linia 20')).toBeVisible()
  await chips.getByRole('button', { name: /Pokaż wszystkie linie/ }).click()
  await expect(page).not.toHaveURL(/[?&]line=/)
})

test('mapa transportu: tryb linii — panel z przebiegiem, zmiana kierunku w URL-u, „×" kończy tryb', async ({ page }) => {
  // Telefon: przy „peek” „Zmień kierunek” leży tuż pod krawędzią arkusza (Pixel 7: 3 px). Klik Playwrighta
  // przewijał wtedy kontener scroll-snap, a przeglądarka płynnie dociągała arkusz do „full” (~460 px) w trakcie
  // kliku — na obciążonym CI cel nie stawał się „stable” (timeout na „×”, dev po PR #141/#142). Ruch arkusza
  // testuje blok „arkusz na telefonie”; tu bez animacji, a arkusz podnosi uchwyt, jak zrobiłby to użytkownik.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openMap(page)
  await pickResult(page, '20', lineRow('20'))
  const panel = page.getByRole('dialog', { name: 'Linia 20' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('list').getByRole('button').first()).toBeVisible({ timeout: READY })
  const handle = page.getByRole('button', { name: /^Zmień wysokość panelu/ })
  if (await handle.isVisible()) {
    await handle.click()
    await handle.click()
    await expect(page.locator('.bottom-sheet')).toHaveAttribute('data-snap', 'full')
  }
  const switchDirection = panel.getByRole('button', { name: 'Zmień kierunek' })
  if (await switchDirection.isVisible()) {
    // Od PR10 nad kierunkiem leży sekcja „Komunikaty linii": na niskim ekranie (iPhone 15, 659 px) przycisk wychodzi poza widok
    // pełnego arkusza o ~12 % i treść przewija się w środku (`[data-sheet-scroll]`, przy `full` jest przewijalna).
    await switchDirection.scrollIntoViewIfNeeded()
    await expect(switchDirection).toBeInViewport({ ratio: 1 })
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
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  // Telefon: „Lista" rozwija arkusz przeglądu do `half`; od `sm` otwiera okno „W widoku" obok mapy.
  const list = isPhone(page) ? page.getByRole('region', { name: 'Pojazdy i przystanki w widoku' }) : page.getByRole('dialog', { name: 'W widoku' })
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
  await pickResult(page, 'Centralna', RAIL_ROW)
  await page.getByRole('dialog', { name: 'Warszawa Centralna' }).getByRole('button', { name: 'Przypnij do Startu' }).click()
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
  await pickResult(page, 'Centralna', RAIL_ROW)
  await expect(page.getByRole('dialog', { name: 'Warszawa Centralna' })).toBeVisible()
  await expectNoBlockingA11y(page)
})

// Regresja (QA 2026-09-30): na 375 px pole wyszukiwania dzieliło rząd z przyciskami i kurczyło się do ~75 px („Sz…").
// Od PR10 jest jedno pole na całą szerokość, pod nim „Lista"/„Filtry"/„Więcej", niżej czipy rodzajów.
test.describe('mapa transportu: szerokość pola wyszukiwania', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'pomiar przy setViewportSize na desktop-chromium; mobile ma własny viewport')
  })

  test('375 px: pole ma co najmniej 280 px, strona nie przewija się w poziomie', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openMap(page)
    const field = await mapSearch(page).boundingBox()
    expect(field!.width).toBeGreaterThanOrEqual(280)
    // Przyciski zostają przy prawej krawędzi: panele „Filtry"/„Więcej" otwierają się w lewo.
    const more = await page.getByRole('button', { name: 'Więcej', exact: true }).boundingBox()
    expect(more!.x + more!.width).toBeCloseTo(field!.x + field!.width, 0)
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('375×812: kontrolki zajmują trzy rzędy — pole, pod nim „Lista"/„Filtry"/„Więcej", niżej czipy rodzajów', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openMap(page)
    const box = async (locator: Locator) => (await locator.boundingBox())!
    const center = async (locator: Locator) => {
      const b = await box(locator)
      return b.y + b.height / 2
    }
    const list = page.getByRole('button', { name: 'Lista', exact: true })
    const listCenter = await center(list)
    expect(await center(page.getByRole('button', { name: /Filtry/ }))).toBeCloseTo(listCenter, 0)
    expect(await center(page.getByRole('button', { name: 'Więcej', exact: true }))).toBeCloseTo(listCenter, 0)
    const field = await box(mapSearch(page))
    expect(field.y).toBeGreaterThanOrEqual((await box(list)).y + (await box(list)).height - 1)
    const chips = page.getByRole('group', { name: 'Rodzaje pojazdów' })
    await expect(chips).toBeVisible({ timeout: READY })
    const [listBox, chipsBox] = [await box(list), await box(chips)]
    expect(chipsBox.y).toBeGreaterThanOrEqual(listBox.y + listBox.height - 1)
  })

  // CI 2026-10-01 (mobile-safari, iPhone 15): przyciski w drugim rzędzie zepchnęły chip linii
  // pod kartę na dole (max 62% mapy), „×" w chipie przestało dać się kliknąć.
  test('393×659: karta linii nie zakrywa chipów filtrów', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 })
    await openMap(page)
    await pickResult(page, '20', lineRow('20'))
    const chips = await page.getByRole('list', { name: 'Aktywne filtry' }).boundingBox()
    const card = await page.getByRole('dialog').boundingBox()
    expect(card!.y).toBeGreaterThanOrEqual(chips!.y + chips!.height - 1)
  })

  test('1280 px: pole rozwija się pod przyciskami', async ({ page }) => {
    await openMap(page)
    const top = async (locator: Locator) => (await locator.boundingBox())!.y
    const row = await top(page.getByRole('button', { name: 'Lista', exact: true }))
    expect(await top(mapSearch(page))).toBeGreaterThan(row)
  })
})

/**
 * Przeciągnięcie jednym palcem przez CDP (`Input.dispatchTouchEvent`) — prawdziwe wejście
 * dotykowe w Chromium, z przewijaniem i dociąganiem do punktów scroll-snap. Tylko Chromium:
 * WebKit w Playwright nie ma API dotyku (gest na iOS = click-QA na urządzeniu).
 *
 * Palec zatrzymuje się przed puszczeniem (zerowa prędkość), a czasy zdarzeń są jawne (`timestamp`), nie zegarowe:
 * puszczenie w ruchu startuje fling, którego headless Chromium nie animuje — przewijanie staje w miejscu palca,
 * bez dociągnięcia do punktu i bez `scrollend` (flaky „dotyk: mapa nad arkuszem…”, 3/8 przy szybkim puszczeniu).
 * Z zegarem ściennym prędkość zależała od obciążenia runnera; z jawnymi czasami gest jest zawsze ten sam.
 */
async function touchDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const start = Date.now() / 1000
  const touch = (type: string, ms: number, touchPoints: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints, timestamp: start + ms / 1000 })
  const to = { x: from.x + dx, y: from.y + dy }
  await touch('touchStart', 0, [from])
  for (let i = 1; i <= 10; i++) await touch('touchMove', i * 16, [{ x: from.x + (dx * i) / 10, y: from.y + (dy * i) / 10 }])
  // Bez ruchu dłużej niż horyzont prędkości Chromium (100 ms) — puszczenie bez flinga.
  for (let i = 1; i <= 3; i++) await touch('touchMove', 160 + i * 60, [to])
  await touch('touchEnd', 400, [])
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

  async function openStopCard(page: Page, name: string, row: RegExp = STOP_ROW): Promise<Locator> {
    await pickResult(page, name, row)
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

  test('atrybucja mapy (OpenFreeMap/OSM) leży nad arkuszem przeglądu i da się ją kliknąć — peek i połowa', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openMap(page)
    // Na 375 px MapLibre pokazuje źródła rozwinięte (linki), na węższych zwija je do przycisku — sprawdzamy to, co faktycznie jest.
    const link = page.getByRole('link', { name: 'OpenFreeMap' })
    for (const snap of ['peek', 'half'] as const) {
      if (snap === 'half') await clickHandleTo(page, 'half')
      await expect(link).toBeVisible()
      const box = (await link.boundingBox())!
      const panelTop = (await sheet(page).locator('.bottom-sheet__panel').boundingBox())!.y
      expect(box.y + box.height, `link OpenFreeMap pod krawędzią arkusza (${snap})`).toBeLessThanOrEqual(panelTop)
      // Pod środkiem linku leży on sam, a nie arkusz ani kontrolka przykrywająca.
      const onTop = await link.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return hit === el || el.contains(hit)
      })
      expect(onTop, `link OpenFreeMap przykryty (${snap})`).toBe(true)
    }
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

    await mapSearch(page).fill('Warszawa')
    const options = searchResults(page).getByRole('button')
    await expect(options.last()).toBeVisible()
    expect(await onTop(options.last()), 'wyniki wyszukiwania pod arkuszem').toBe(true)
  })

  test('„×" w karcie zamyka kartę, a arkusz wraca do przeglądu', async ({ page }) => {
    await openMap(page)
    const card = await openStopCard(page, 'Centrum')
    await expect(sheet(page)).toHaveCount(1)
    await card.getByRole('button', { name: 'Zamknij kartę' }).click()
    await expect(card).toBeHidden()
    // Od PR10 telefon zawsze ma arkusz: bez karty, okolicy i linii jest w nim przegląd (`peek`).
    await expect(sheet(page)).toHaveCount(1)
    await expect(page.getByRole('region', { name: 'Pojazdy i przystanki w widoku' })).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
  })

  test('nowy panel przy pełnym arkuszu startuje znów nisko (peek)', async ({ page }) => {
    await openMap(page)
    const card = await openStopCard(page, 'Warszawa Centralna', RAIL_ROW)
    for (const snap of ['half', 'full'] as const) await clickHandleTo(page, snap)
    await card.getByRole('button', { name: 'Co jest w pobliżu?' }).click()
    await expect(page.getByRole('dialog', { name: 'W pobliżu' })).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
  })

  // PR4 (decyzja z PR3): przy half/full arkusz zakrywał „Aktywne filtry” i komunikaty (role=status).
  // Teraz jadą na górnej krawędzi arkusza — widoczne i klikalne w każdym punkcie. Komunikat o awarii
  // stacji kolejowych, bo jest trwały; „Skopiowano link…” znika po kilku sekundach (flaky pod obciążeniem),
  // a oba idą tym samym stosem (`statusStack` w `map/page.tsx`).
  const uncovered = (locator: Locator) =>
    locator.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
    })

  // Od PR10 w slocie `above` statusy i „Moja lokalizacja" stoją w JEDNYM rzędzie przy krawędzi arkusza (status po lewej, przycisk po prawej).
  // Dwa rzędy jeden nad drugim wypychały trwały komunikat pod nagłówek strony przy „full” (nad arkuszem ~55 px, bug z 7a). Chipy filtrów
  // leżą wyżej i przy „full” mogą się uciąć (decyzja usera, PR4) — tego nie sprawdzamy.
  test('chipy filtrów i komunikaty statusu zostają nad arkuszem przy half; status i „Moja lokalizacja" także przy full', async ({ page }) => {
    await page.route('**/api/rail-stations/list**', (route) => route.abort())
    await openMap(page, `${CITY_MAP}?hide=busStops`)
    await openStopCard(page, 'Centrum')
    const chips = page.getByRole('list', { name: 'Aktywne filtry' })
    const problem = page.getByRole('status').filter({ hasText: 'Nie udało się wczytać stacji kolejowych — ponawiam.' })
    const locate = page.getByRole('button', { name: 'Moja lokalizacja' })
    await expect(problem).toBeAttached({ timeout: READY })
    for (const [snap, visible] of [['half', [chips, problem, locate]], ['full', [problem, locate]]] as const) {
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

  // Wąski telefon (320 px): długi status zawija tekst w kolumnie obok przycisku — nie nachodzi na niego, a przycisk zachowuje cel 44 px.
  // Odmowa lokalizacji (komunikat NAD przyciskiem, w przepływie) też nie nachodzi na status obok.
  for (const width of [375, 320]) {
    test(`${width} px: długi status zawija się obok „Moja lokalizacja", bez nachodzenia, cel 44 px`, async ({ page }) => {
      await stubGeolocation(page, 'deny')
      await page.route('**/api/rail-stations/list**', (route) => route.abort())
      await page.setViewportSize({ width, height: 812 })
      await openMap(page)
      await openStopCard(page, 'Centrum')
      const problem = page.getByRole('status').filter({ hasText: 'Nie udało się wczytać stacji kolejowych — ponawiam.' })
      const locate = page.getByRole('button', { name: 'Moja lokalizacja' })
      await expect(problem).toBeVisible({ timeout: READY })
      await locate.click()
      const denied = page.getByRole('status').filter({ hasText: 'Brak dostępu do lokalizacji' })
      await expect(denied).toBeVisible()
      const [p, l, d] = [(await problem.boundingBox())!, (await locate.boundingBox())!, (await denied.boundingBox())!]
      const overlap = (a: typeof p, b: typeof p) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      expect(overlap(p, l), 'status nachodzi na przycisk').toBe(false)
      expect(overlap(p, d), 'status nachodzi na komunikat o odmowie').toBe(false)
      expect(overlap(d, l), 'komunikat o odmowie nachodzi na przycisk').toBe(false)
      expect(l.width).toBeGreaterThanOrEqual(44)
      expect(l.height).toBeGreaterThanOrEqual(44)
      expect(p.x + p.width).toBeLessThanOrEqual(width)
      expect(d.x + d.width).toBeLessThanOrEqual(width)
      expect(l.x + l.width).toBeLessThanOrEqual(width)
      // Dolna krawędź statusu i przycisku w jednej linii (rząd wyrównany do krawędzi arkusza).
      expect(Math.abs(p.y + p.height - (l.y + l.height))).toBeLessThanOrEqual(1)
    })
  }

  test('pełny arkusz: treść panelu przewija się w środku, niższy — nie', async ({ page }) => {
    await openMap(page)
    await openStopCard(page, 'Centrum')
    const body = page.locator('.bottom-sheet [data-sheet-scroll]')
    await expect(body).toHaveCSS('overflow-y', 'hidden')
    for (const snap of ['half', 'full'] as const) await clickHandleTo(page, snap)
    await expect(body).toHaveCSS('overflow-y', 'auto')
  })

  // Panel z krótką treścią (nic do przewinięcia w środku) też ma dać się podnieść dotykiem: `overscroll-behavior: contain`
  // na jego treści urywało łańcuch przewijania i przeciągnięcie nie docierało do arkusza (Chromium). „W pobliżu” otwiera
  // się też długim przyciśnięciem mapy — na obciążonej maszynie robi to nawet wolny gest z testu poniżej.
  test('dotyk: arkusz „W pobliżu” (krótka treść) da się przeciągnąć', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'dotyk przez CDP tylko w Chromium')
    const map = await openMap(page)
    const card = await openStopCard(page, 'Centrum')
    await card.getByRole('button', { name: 'Co jest w pobliżu?' }).click()
    await expect(page.getByRole('dialog', { name: 'W pobliżu' })).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    const box = (await map.boundingBox())!
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.9 }, 0, -250)
    await expect(sheet(page)).not.toHaveAttribute('data-snap', 'peek', { timeout: READY })
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
    // `touchDrag` wraca, zanim strona obsłuży gest: na obciążonej maszynie (programowy WebGL) ramki przewijania dzielą
    // sekundy. Czekamy na stan pochodny arkusza (`data-snap`, ustala się po ciszy w `scroll`), nie na `scrollend` —
    // Chromium po dotykowym przewijaniu z `scroll-snap` bywa go nie wysłać (zmierzone: `scroll` dojechał do „half”,
    // `data-snap="half"`, a `scrollend` nie przyszedł w 12 s), więc czekanie na niego wisiało do limitu testu.
    await expect(sheet(page)).not.toHaveAttribute('data-snap', 'peek', { timeout: READY })
  })

  // Regresja z 912a815: `overscroll-contain` na treści `PanelFrame` (poniżej `full` ma `overflow-y: hidden`) urywał
  // łańcuch przewijania w Chromium — przeciągnięcie za treść karty nie podnosiło arkusza, działał tylko uchwyt i nagłówek.
  test('dotyk: przeciągnięcie za treść karty (nie uchwyt) podnosi arkusz', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'dotyk przez CDP tylko w Chromium')
    await openMap(page)
    const card = await openStopCard(page, 'Centrum')
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    const body = (await card.getByLabel('Szczegóły', { exact: true }).boundingBox())!
    await touchDrag(page, { x: body.x + body.width / 2, y: body.y + 16 }, 0, -250)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half', { timeout: READY })
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

// ── PR10 (Task 7): trzy stany, linie każdego rodzaju, filtry ───────────────────────────────────────────────
// Telefon (375×812): arkusz od dołu — przegląd w `peek`, karta/okolica/linia w tym samym arkuszu. Szeroki (1280): bez arkusza,
// obiekt w `aside` „Wybrany obiekt", legenda przy mapie. Szeroki układ mierzymy tylko na desktop-chromium (emulowany telefon z
// szerokim viewportem to nie ten sam układ). Mock: tramwaj 20 (2 pojazdy), M1, 128 i S2 po 1 pojazdem; M2 i 521 bez pojazdów.
const sheetOf = (page: Page): Locator => page.locator('.bottom-sheet')
const asideOf = (page: Page): Locator => page.getByRole('complementary', { name: 'Wybrany obiekt' })
/** Powierzchnia panelu obiektu: arkusz na telefonie, `aside` od `sm`. */
const dock = (page: Page): Locator => (isPhone(page) ? sheetOf(page) : asideOf(page))
const OVERVIEW = 'Pojazdy i przystanki w widoku'
const FILTERS_BUTTON = /^Filtry/

for (const [label, viewport] of [
  ['375×812', { width: 375, height: 812 }],
  ['1280×800', { width: 1280, height: 800 }],
] as const) {
  test.describe(`mapa transportu: trzy stany, linie i filtry (${label})`, () => {
    test.use({ viewport })
    test.beforeEach(({}, testInfo) => {
      test.skip(viewport.width >= 640 && testInfo.project.name !== 'desktop-chromium', 'szeroki układ tylko na desktop-chromium')
    })

    test('przegląd: „Lista" i „Filtry" widoczne bez menu; telefon — arkusz peek z wiekiem pozycji i legendą, szeroki — legenda przy mapie', async ({ page }) => {
      await openMap(page)
      const list = page.getByRole('button', { name: 'Lista', exact: true })
      await expect(list).toBeVisible()
      await expect(list).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByRole('button', { name: FILTERS_BUTTON })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Więcej' })).toHaveCount(0) // menu „Więcej" zamknięte — to nie w nim są przyciski
      await expect(asideOf(page)).toHaveCount(0)
      if (isPhone(page)) {
        const overview = page.getByRole('region', { name: OVERVIEW })
        await expect(overview).toBeVisible()
        await expect(sheetOf(page)).toHaveAttribute('data-snap', 'peek')
        await expect(overview.getByText(/Pozycje sprzed /)).toBeVisible({ timeout: READY }) // wiek GPS, nie czas pobrania
        await expect(overview.getByRole('list', { name: 'Legenda rodzajów' })).toBeVisible()
      } else {
        await expect(sheetOf(page)).toHaveCount(0)
        await expect(page.getByRole('region', { name: OVERVIEW })).toHaveCount(0)
        await expect(page.getByText('Legenda', { exact: true })).toBeVisible()
      }
    })

    test('wybór: karta przystanku i karta pojazdu w arkuszu (telefon) albo w aside (szeroki); zamknięcie wraca do przeglądu', async ({ page }) => {
      await openMap(page)
      // Pojazd najpierw, w kadrze startowym (po wyborze przystanku kamera leci do niego i tramwaje wypadają z kadru): z „Listy",
      // bo obiekty na canvasie nie są fokusowalne.
      const list = await openVisibleList(page)
      await list.getByRole('button', { name: /^Linia 20/ }).first().click({ timeout: READY })
      const vehicle = dock(page).getByRole('dialog', { name: /^tramwaj 20$/i })
      await expect(vehicle).toBeVisible()
      await expect(vehicle.getByText(/Pozycja sprzed /)).toBeVisible() // wiek GPS pojazdu, nigdy „na czas" (#13)
      await expect(vehicle.getByText(/na czas/)).toHaveCount(0)
      await vehicle.getByRole('button', { name: 'Zamknij kartę' }).click()
      await expect(vehicle).toBeHidden()
      const listButton = page.getByRole('button', { name: 'Lista', exact: true })
      if ((await listButton.getAttribute('aria-pressed')) === 'true') await listButton.click() // zamknięta karta zostawia otwartą listę

      await pickResult(page, 'Centrum', STOP_ROW)
      const stop = dock(page).getByRole('dialog', { name: 'Centrum' })
      await expect(stop).toBeVisible()
      if (isPhone(page)) {
        await expect(sheetOf(page)).toHaveAttribute('data-snap', 'peek')
        await expect(page.getByRole('region', { name: OVERVIEW })).toHaveCount(0)
      } else await expect(sheetOf(page)).toHaveCount(0)
      await stop.getByRole('button', { name: 'Zamknij kartę' }).click()
      await expect(stop).toBeHidden()
      if (isPhone(page)) await expect(page.getByRole('region', { name: OVERVIEW })).toBeVisible()
      else await expect(asideOf(page)).toHaveCount(0)
    })

    test('okolica: „Co jest w pobliżu?" otwiera panel w arkuszu/aside z odległościami w linii prostej', async ({ page }) => {
      await openMap(page)
      await pickResult(page, 'Centrum', STOP_ROW)
      await dock(page).getByRole('button', { name: 'Co jest w pobliżu?' }).click()
      const nearby = dock(page).getByRole('dialog', { name: 'W pobliżu' })
      await expect(nearby).toBeVisible()
      await expect(nearby.getByText('Promień 500 m · w linii prostej')).toBeVisible()
      if (isPhone(page)) await expect(sheetOf(page)).toHaveAttribute('data-snap', 'peek')
      await page.keyboard.press('Escape')
      await expect(nearby).toBeHidden()
      if (isPhone(page)) await expect(page.getByRole('region', { name: OVERVIEW })).toBeVisible()
    })

    test('linia z wyszukiwarki: panel z przebiegiem i sekcją „Komunikaty linii 20"; „×" wraca do przeglądu', async ({ page }) => {
      await openMap(page)
      await pickResult(page, '20', lineRow('20'))
      await expect(page).toHaveURL(/[?&]line=20/)
      const panel = dock(page).getByRole('dialog', { name: 'Linia 20' })
      await expect(panel).toBeVisible()
      await expect(panel.getByRole('heading', { name: 'Komunikaty linii 20' })).toBeVisible()
      // Mock: alert A/TEST/1 na linię 20 (fixtures/gtfs/warszawa/alerts.json) — ta sama odpowiedź co przebieg, bez osobnego pollera.
      await expect(panel.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
      await panel.getByRole('button', { name: 'Zakończ tryb linii' }).click()
      await expect(panel).toBeHidden()
      await expect(page).not.toHaveURL(/[?&]line=/)
      if (isPhone(page)) await expect(page.getByRole('region', { name: OVERVIEW })).toBeVisible()
    })

    // Kolor i ikona w panelu linii pochodzą z jednej palety/słownika (`lineColor`, `MODE_ICON`): każdy rodzaj inny, ta sama ikona co czip rodzaju.
    test('linie każdego rodzaju: właściwa paleta, ikona i liczba pojazdów; „×" wraca do listy', async ({ page }) => {
      await openMap(page)
      const looks = new Map<string, string>()
      for (const { query, label: mode, rgb, chip, vehicles } of [
        { query: '20', label: 'tramwaj', rgb: 'rgb(14, 116, 144)', chip: 'Tramwaje', vehicles: 2 },
        { query: '128', label: 'autobus', rgb: 'rgb(136, 0, 119)', chip: 'Autobusy', vehicles: 1 },
        { query: 'M1', label: 'metro', rgb: 'rgb(248, 217, 88)', chip: 'Metro', vehicles: 1 },
        { query: 'S2', label: 'kolej', rgb: 'rgb(37, 99, 235)', chip: 'Pociągi', vehicles: 1 },
      ]) {
        await pickResult(page, query, lineRow(query))
        const panel = dock(page).getByRole('dialog', { name: `Linia ${query}` })
        await expect(panel).toBeVisible()
        await expect(panel.getByText(`${mode} · Dostępne pozycje pojazdów: ${vehicles}`)).toBeVisible({ timeout: READY })
        const badge = panel.locator('[style*="background"]').first()
        expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor), `kolor linii ${query}`).toBe(rgb)
        const icon = await badge.locator('svg').evaluate((el) => el.innerHTML)
        expect(icon, `ikona linii ${query}`).not.toBe('')
        looks.set(query, icon)
        // Telefon: czip rodzaju w pasku to ten sam `MODE_ICON` (jeden słownik).
        if (isPhone(page)) expect(await page.getByRole('group', { name: 'Rodzaje pojazdów' }).getByRole('button', { name: chip }).locator('svg').evaluate((el) => el.innerHTML)).toBe(icon)
        await panel.getByRole('button', { name: 'Zakończ tryb linii' }).click()
        await expect(panel).toBeHidden()
      }
      expect(new Set(looks.values()).size, 'cztery rodzaje = cztery różne ikony').toBe(4)
      const list = await openVisibleList(page)
      await expect(list.getByRole('button', { name: /^Linia 20/ }).first()).toBeVisible({ timeout: READY }) // po powrocie lista obiektów działa
    })

    test('linia bez pojazdów (M2): panel z „w trasie: 0", bez błędu; powrót do listy', async ({ page }) => {
      await openMap(page)
      await pickResult(page, 'M2', lineRow('M2'))
      const panel = dock(page).getByRole('dialog', { name: 'Linia M2' })
      await expect(panel).toBeVisible()
      await expect(panel.getByText('metro · Dostępne pozycje pojazdów: 0')).toBeVisible({ timeout: READY })
      await expect(panel.getByText(/Nie udało się pobrać przebiegu linii/)).toHaveCount(0)
      await panel.getByRole('button', { name: 'Zakończ tryb linii' }).click()
      await expect(panel).toBeHidden()
      const list = await openVisibleList(page)
      await expect(list.getByRole('button', { name: /^Linia 20/ }).first()).toBeVisible({ timeout: READY })
    })

    test('linia kolei miejskiej (GTFS S2): przystanek i pojazd nigdy nie pytają /api/train ani nie linkują do połączenia PKP (#13)', async ({ page }) => {
      const trainCalls: string[] = []
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/train')) trainCalls.push(request.url())
      })
      await openMap(page)
      await pickResult(page, 'S2', lineRow('S2'))
      const panel = dock(page).getByRole('dialog', { name: 'Linia S2' })
      await expect(panel).toBeVisible()
      await panel.getByRole('list').getByRole('button').first().click({ timeout: READY }) // pierwszy przystanek trasy
      await expect(dock(page).getByText('Stacja kolei miejskiej')).toBeVisible()
      await expect(page.locator('a[href^="/connection/"]')).toHaveCount(0)
      await page.waitForTimeout(1_000) // asercja negatywna: zapytanie MOGŁOBY wyjść po otwarciu karty
      expect(trainCalls).toEqual([])
    })

    test('„Wyczyść filtry" zeruje warstwy, linię, kierunek i utrudnienia, a miasto i kadr zostają', async ({ page }) => {
      await openMap(page, `${CITY_MAP}?hide=trams,busStops&line=20&dir=1&alerts=1&at=52.23000,21.00800,14.0`)
      const chips = page.getByRole('list', { name: 'Aktywne filtry' })
      await expect(chips.getByText('Linia 20')).toBeVisible({ timeout: READY })
      await expect(page.getByRole('button', { name: FILTERS_BUTTON })).toHaveAccessibleName(/Filtry\s*4\s*aktywnych ograniczeń/)
      await page.getByRole('button', { name: 'Wyczyść filtry' }).first().click()
      await expect(chips).toHaveCount(0)
      const url = new URL(page.url())
      expect(url.pathname).toBe('/city/warszawa/map')
      for (const param of ['hide', 'line', 'dir', 'alerts', 'vehicles', 'rail', 'mode']) expect(url.searchParams.has(param), `?${param} zostało`).toBe(false)
      expect(url.searchParams.get('at')).not.toBeNull()
      await expect(page.getByRole('button', { name: FILTERS_BUTTON })).toHaveAccessibleName('Filtry')
      await expect(page.getByRole('dialog', { name: 'Linia 20' })).toHaveCount(0)
    })

    test('licznik na „Filtry" = ukryte warstwy + linia + utrudnienia (ta sama liczba co czipy)', async ({ page }) => {
      await openMap(page, `${CITY_MAP}?hide=trams`)
      const filters = page.getByRole('button', { name: FILTERS_BUTTON })
      await expect(filters).toHaveAccessibleName(/Filtry\s*1\s*aktywnych ograniczeń/)
      await page.getByRole('button', { name: 'Pokaż: tramwaje' }).click()
      await expect(filters).toHaveAccessibleName('Filtry')
      await pickResult(page, '128', lineRow('128'))
      await expect(filters).toHaveAccessibleName(/Filtry\s*1\s*aktywnych ograniczeń/)
      await filters.click()
      await page.getByRole('checkbox', { name: 'Tylko linie z utrudnieniami' }).check()
      await expect(filters).toHaveAccessibleName(/Filtry\s*2\s*aktywnych ograniczeń/)
      await expect(page.getByRole('list', { name: 'Aktywne filtry' }).getByRole('listitem')).toHaveCount(2)
    })

    test('czip rodzaju pojazdów przełącza tę samą warstwę co „Filtry" (tylko telefon ma czipy)', async ({ page }) => {
      test.skip(viewport.width >= 640, 'czipy rodzajów są tylko na telefonie; od `sm` te same warstwy są w „Filtry"')
      await openMap(page)
      const chips = page.getByRole('group', { name: 'Rodzaje pojazdów' })
      const trams = chips.getByRole('button', { name: 'Tramwaje' })
      await expect(trams).toHaveAttribute('aria-pressed', 'true', { timeout: READY })
      await trams.click()
      await expect(trams).toHaveAttribute('aria-pressed', 'false')
      await expect(page).toHaveURL(/[?&]hide=trams(&|$)/)
      await expect(page.getByRole('button', { name: FILTERS_BUTTON })).toHaveAccessibleName(/Filtry\s*1\s*aktywnych ograniczeń/)
      await page.getByRole('button', { name: FILTERS_BUTTON }).click()
      const checkbox = page.getByRole('checkbox', { name: 'Tramwaje' })
      await expect(checkbox).not.toBeChecked() // ten sam zbiór `hidden`
      await checkbox.check()
      await expect(trams).toHaveAttribute('aria-pressed', 'true')
      await expect(page).not.toHaveURL(/[?&]hide=/)
    })
  })
}

// ── PR10 (Task 7): „Moja lokalizacja" — GPS tylko po kliknięciu, punkt użytkownika nigdy w URL-u ani w localStorage (adr/0012) ──
const USER = { latitude: 52.23418, longitude: 21.01937 } // Śródmieście; nietypowe cyfry, żeby dało się je wyszukać w adresie/storage
const DENIED_TEXT = 'Brak dostępu do lokalizacji. Wyszukaj miejsce lub wybierz je na mapie'
const NEARBY_NEEDS_LOCATION = 'Okolica wymaga Twojej lokalizacji.'

/** Metry od punktu użytkownika do `lat,lon` (haversine). */
function metresFromUser(lat: number, lon: number): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat - USER.latitude) * rad) / 2) ** 2 + Math.cos(USER.latitude * rad) * Math.cos(lat * rad) * Math.sin(((lon - USER.longitude) * rad) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a))
}

/** Wszystko, co strona zapamiętuje o widoku: adres i cały localStorage (tylko własny origin testu). */
async function storedView(page: Page): Promise<{ url: string; storage: string; at: string | null }> {
  return page.evaluate(() => ({ url: location.href, storage: JSON.stringify(Object.entries(localStorage)), at: new URL(location.href).searchParams.get('at') }))
}

test.describe('mapa transportu: lokalizacja użytkownika', () => {
  const locate = (page: Page): Locator => page.getByRole('button', { name: 'Moja lokalizacja' })

  test('strona nigdy nie pyta o GPS przy wejściu — także z ?nearby=1; pyta dopiero po kliknięciu', async ({ page }) => {
    await stubGeolocation(page, 'deny')
    await openMap(page)
    await expect(locate(page)).toBeVisible()
    await expect(locate(page)).toHaveAttribute('aria-busy', 'false')
    await page.waitForTimeout(1_500) // asercja negatywna: wywołanie MOGŁOBY wyjść po montażu
    expect(await geolocationCalls(page)).toBe(0)

    // F5 / link z Startu bez punktu w pamięci: komunikat z przyciskiem, nadal zero wywołań.
    await page.goto(`${CITY_MAP}?nearby=1`)
    const notice = page.getByRole('status').filter({ hasText: NEARBY_NEEDS_LOCATION })
    await expect(notice).toBeVisible({ timeout: READY })
    await page.waitForTimeout(1_000)
    expect(await geolocationCalls(page)).toBe(0)
    await notice.getByRole('button', { name: 'Pokaż moją lokalizację' }).click()
    await expect.poll(() => geolocationCalls(page)).toBe(1) // klik = jedyne wywołanie
    await expect(page.getByText(DENIED_TEXT)).toBeVisible()
    await expect(notice).toBeHidden() // flaga zużyta, przycisk nie wraca
    await expect(page).not.toHaveURL(/[?&]nearby=/)
  })

  test('odmowa: komunikat bez przycisku ponowienia, zero kolejnych pytań, mapa dalej używalna', async ({ page }) => {
    await stubGeolocation(page, 'deny')
    await openMap(page)
    await locate(page).click()
    const status = page.getByRole('status').filter({ hasText: DENIED_TEXT })
    await expect(status).toBeVisible()
    await expect(status.getByRole('button')).toHaveCount(0)
    expect(await geolocationCalls(page)).toBe(1)
    await locate(page).click() // przeglądarka i tak nie zapyta drugi raz — aplikacja nawet nie próbuje
    await page.waitForTimeout(500)
    expect(await geolocationCalls(page)).toBe(1)
    await expect(status).toBeVisible()
    // Wyszukaj miejsce — dokładnie to, co mówi komunikat.
    await pickResult(page, 'Centralna', RAIL_ROW)
    await expect(page.getByRole('dialog', { name: 'Warszawa Centralna' })).toBeVisible()
  })

  test.describe('zgoda', () => {
    test.use({ geolocation: USER, permissions: ['geolocation'] })

    test('okolica po kliknięciu; pozycja użytkownika nie trafia do adresu ani do localStorage po przesunięciu, przybliżeniu i klawiaturze', async ({ page, browserName }) => {
      await stubGeolocation(page, 'delegate')
      const map = await openMap(page)
      const box = (await map.boundingBox())!
      // Widok zapisuje się dopiero po ruchu użytkownika: przesuwamy mapę, żeby przed kliknięciem był zapisany jakiś widok.
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 8 })
      await page.mouse.up()
      await expect(page).toHaveURL(/[?&]at=/, { timeout: READY })
      expect(await geolocationCalls(page)).toBe(0)
      const stored = (await storedView(page)).storage

      await locate(page).click()
      const nearby = dock(page).getByRole('dialog', { name: 'W pobliżu' })
      await expect(nearby).toBeVisible({ timeout: READY })
      expect(await geolocationCalls(page)).toBe(1)
      await page.waitForTimeout(2_000) // kamera dolatuje do użytkownika
      const view = (await map.boundingBox())!

      // Zachowania, które przesuwają środek kadru bez `dragstart` (zatrzask + promień ochronny): koło myszy poza środkiem i strzałki.
      if (browserName !== 'webkit') {
        // Mobilny WebKit w Playwright nie ma `mouse.wheel` — tam zostają strzałki (zoom szczypnięciem to click-QA na iPhonie).
        await page.mouse.move(view.x + view.width / 2 + 100, view.y + view.height * 0.45 - 60)
        await page.mouse.wheel(0, -400)
        await page.waitForTimeout(1_200)
      }
      await map.focus() // region mapy to sam canvas MapLibre (tabindex 0)
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(1_200)

      const during = await storedView(page)
      expect(during.at, 'adres dostał ?at= z widokiem wycentrowanym na użytkowniku').toBeNull()
      expect(during.storage, 'localStorage zmienił zapisany widok w trakcie widoku „W pobliżu"').toBe(stored)
      for (const digits of [USER.latitude.toFixed(5), USER.longitude.toFixed(5)]) expect(during.url + during.storage).not.toContain(digits)

      // Przeciągnięcie daleko od użytkownika kończy zatrzask: widok znów się zapisuje, ale już poza promieniem ochronnym (150 px).
      // Dwa przeciągnięcia w tę samą stronę co strzałki (treść w lewo): na wąskim telefonie jedno nie wychodzi poza promień ochronny (zawyżony 2×).
      for (let drag = 0; drag < 2; drag++) {
        await page.mouse.move(view.x + view.width * 0.95, view.y + view.height * 0.45)
        await page.mouse.down()
        await page.mouse.move(view.x + view.width * 0.05, view.y + view.height * 0.45, { steps: 12 })
        await page.mouse.up()
      }
      await expect.poll(async () => (await storedView(page)).at, { timeout: READY }).not.toBeNull()
      const after = await storedView(page)
      const [lat, lon, zoom] = after.at!.split(',').map(Number)
      const protectedMetres = (150 * 156_543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
      expect(metresFromUser(lat, lon), `zapisany widok ${after.at} leży w promieniu ochronnym wokół użytkownika`).toBeGreaterThan(protectedMetres)
      // Para współrzędnych użytkownika nigdzie (jedna składowa może się zbiec: przeciągnięcie w poziomie zostawia szerokość bez zmian).
      expect(decodeURIComponent(after.url) + after.storage).not.toContain(`${USER.latitude.toFixed(5)},${USER.longitude.toFixed(5)}`)
    })

    test('po pełnym przeładowaniu punkt znika z pamięci: ?nearby=1 pokazuje „Pokaż moją lokalizację" i dopiero klik pyta o GPS', async ({ page }) => {
      await stubGeolocation(page, 'delegate')
      await openMap(page)
      await locate(page).click()
      await expect(dock(page).getByRole('dialog', { name: 'W pobliżu' })).toBeVisible({ timeout: READY })

      await page.goto(`${CITY_MAP}?nearby=1`) // jak F5 na adresie z flagą: provider startuje od zera
      const notice = page.getByRole('status').filter({ hasText: NEARBY_NEEDS_LOCATION })
      await expect(notice).toBeVisible({ timeout: READY })
      await page.waitForTimeout(1_000)
      expect(await geolocationCalls(page)).toBe(0)
      await expect(dock(page).getByRole('dialog', { name: 'W pobliżu' })).toHaveCount(0)
      await notice.getByRole('button', { name: 'Pokaż moją lokalizację' }).click()
      await expect(dock(page).getByRole('dialog', { name: 'W pobliżu' })).toBeVisible({ timeout: READY })
      expect(await geolocationCalls(page)).toBe(1)
      await expect(page).not.toHaveURL(/[?&]nearby=/)
      await expect(page).not.toHaveURL(/[?&]at=/)
    })
  })
})

// ── PR10 (Task 7): motyw jasny → ciemny → jasny ────────────────────────────────────────────────────────────
test('motyw jasny → ciemny → jasny: zaznaczenie i ukryte warstwy zostają, przełączenie nie wywołuje nowych zapytań o dane', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('theme', 'light'))
  const dataCalls: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    // Odczyt pozycji pojazdów jest okresowy (15 s) i nie ma związku z motywem — pomijamy go, reszta (rozkład, przystanki, kolej, tablice) nie może ruszyć.
    if (/^\/api\/(train|board|gtfs|rail-stations)/.test(pathname) && !pathname.endsWith('/city-vehicles')) dataCalls.push(pathname)
  })
  const map = await openMap(page, `${CITY_MAP}?hide=buses`)
  const list = await openVisibleList(page)
  await list.getByRole('button', { name: /^Linia 20/ }).first().click({ timeout: READY })
  // The selected object moves between the desktop aside and phone sheet on resize.
  const card = page.getByRole('dialog', { name: /^tramwaj 20$/i })
  await expect(card).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1_000)
  const html = page.locator('html')
  await expect(html).toHaveClass(/light/)
  const settled = dataCalls.length
  const canvas = await map.elementHandle()

  for (const [button, theme] of [['Przełącz na tryb ciemny', 'dark'], ['Przełącz na tryb jasny', 'light']] as const) {
    await changeTheme(page, button)
    await expect(html).toHaveClass(new RegExp(theme))
    await expect(card).toBeVisible() // zaznaczony pojazd zostaje
    await expect(page).toHaveURL(/[?&]hide=buses(&|$)/) // ukryta warstwa zostaje
    await expect(page.getByRole('list', { name: 'Aktywne filtry' }).getByText('Ukryte: autobusy')).toBeVisible()
    await expectTilesRendered(map) // nowy podkład narysowany, kamera i warstwy nie zniknęły
    await page.setViewportSize({ width: theme === 'dark' ? 1440 : 375, height: 900 })
    await expect(card).toBeVisible()
    expect(await map.evaluate((element, original) => element === original, canvas)).toBe(true)
  }
  await page.waitForTimeout(1_000)
  expect(dataCalls.slice(settled), 'przełączenie motywu wywołało zapytania o dane').toEqual([])
})
