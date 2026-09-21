import { test, expect, type Locator } from '@playwright/test'
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
  // MapLibre przebudowuje atrybucję (linki) po załadowaniu stylu -- Tab przed tym gubi fokus na body.
  await expectTilesRendered(dialog.locator('canvas'))
  await expect(dialog.getByRole('link', { name: 'MapLibre' })).toBeVisible()

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
