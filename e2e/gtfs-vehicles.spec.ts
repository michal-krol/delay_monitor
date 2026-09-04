import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Mock feed: fixtures/gtfs/warszawa/vehicles.json ma 2 pozycje na kursach
// linii 20 (`20-wd-0-1`/`20-wd-0-2`), side_number 3801 / 3802. AGENTS.md #13.
const LINE_20 = '/miasto/warszawa/linia/20'

// GTFS mock parsuje się raz przy starcie serwera, a poller pojazdów budzi się
// z pollerem rozkładu przy pierwszym trafieniu /api/gtfs/* — strona ponawia.
const READY = 45_000

test('linia: marker pojazdu na osi + karta „Pojazdy w trasie" ze znakiem bocznym', async ({ page }) => {
  await page.goto(LINE_20)
  await expect(page.getByRole('heading', { name: 'Linia 20' })).toBeVisible({ timeout: READY })
  await expect(page.getByText(/#380\d/).first()).toBeVisible({ timeout: READY })
})

test('widżet sieci: „W trasie teraz" pokazuje liczbę, nie „—"', async ({ page }, testInfo) => {
  // Widżet sieci renderuje się dopiero od `xl` (`hidden xl:flex` w page.tsx).
  test.skip(testInfo.project.name !== 'desktop-chromium', 'widżet sieci tylko na desktopie')
  await page.goto('/miasto/warszawa')
  const line = page.getByText(/W trasie teraz/)
  await expect(line).toBeVisible({ timeout: READY })
  // feed mock jest gotowy => konkretna liczba, nigdy „—" (#7: null ≠ 0).
  await expect(line).toContainText(/W trasie teraz:\s*\d/, { timeout: READY })
})

test('a11y: strona linii z markerami pojazdów bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(LINE_20)
  await expect(page.getByRole('heading', { name: 'Linia 20' })).toBeVisible({ timeout: READY })
  await expect(page.getByText(/#380\d/).first()).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
