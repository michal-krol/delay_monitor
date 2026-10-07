import { test, expect } from '@playwright/test'
import { scanA11y } from './helpers/axe'

// Mock feed: fixtures/gtfs/warszawa/vehicles.json ma 2 pozycje na kursach
// linii 20 (`20-wd-0-1`/`20-wd-0-2`), side_number 3801 / 3802. AGENTS.md #13.
const LINE_20 = '/city/warszawa/line/20'

// GTFS mock parsuje się raz przy starcie serwera, a poller pojazdów budzi się
// z pollerem rozkładu przy pierwszym trafieniu /api/gtfs/* — strona ponawia.
const READY = 45_000

test('linia: marker pojazdu na osi + karta „Pojazdy w trasie" ze znakiem bocznym', async ({ page }) => {
  await page.goto(LINE_20)
  // Nagłówek „Trasa linii" renderuje się na każdym viewporcie (nagłówek „Linia 20"
  // to tytuł karty w PageAside).
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  // Marker na osi trasy renderuje się na każdym viewporcie (jest w <ol>, nie w aside).
  await expect(page.getByTitle(/^Pojazd 380\d/).first()).toBeVisible({ timeout: READY })

  // Karta „Pojazdy w trasie" w PageAside (od `xl` po prawej, niżej pod treścią).
  await expect(page.getByText(/#380\d/).first()).toBeVisible({ timeout: READY })
})

test('widżet sieci: „W trasie teraz" pokazuje liczbę, nie „—"', async ({ page }) => {
  await page.goto('/city/warszawa')
  const line = page.getByText(/W trasie teraz/)
  await expect(line).toBeVisible({ timeout: READY })
  // feed mock jest gotowy => konkretna liczba, nigdy „—" (#7: null ≠ 0).
  await expect(line).toContainText(/W trasie teraz:\s*\d/, { timeout: READY })
})

test('a11y: strona linii z markerami pojazdów bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(LINE_20)
  // Precondition widoczna na każdym viewporcie (nagłówek trasy + marker na osi, nie karta aside).
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByTitle(/^Pojazd 380\d/).first()).toBeVisible({ timeout: READY })

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
