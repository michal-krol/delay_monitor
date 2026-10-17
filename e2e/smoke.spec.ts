import { test, expect } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { isDesktop, searchField } from './helpers/search'

// Mock ma prawdziwe ID: Warszawa Centralna 33605 (AGENTS.md #8).
const STATION = { id: '33605', name: 'Warszawa Centralna' }
const boardUrl = `/station/${STATION.id}?name=${encodeURIComponent(STATION.name)}`

test('pulpit: pusty stan z przyciskiem „Dodaj"', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dodaj' })).toBeVisible()
})

test('tablica stacji: powłoka renderuje się natychmiast, bez czekania na dane', async ({ page }) => {
  await page.goto(boardUrl)
  await expect(page.getByRole('heading', { name: STATION.name, exact: true })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Kierunek' })).toBeVisible()
})

test('tablica → wiersze połączeń → szczegóły połączenia po kliknięciu', async ({ page }) => {
  await page.goto(boardUrl)

  // Poller wypełnia snapshot async (~kilka s), a klient po serii szybkich prób
  // odpytuje dopiero co 30 s — wymuszamy świeże zapytanie przez reload zamiast
  // czekać w oknie martwym.
  const rowButton = page.locator('td button[aria-label]').first()
  await expect(async () => {
    await page.reload()
    await expect(rowButton).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })

  await rowButton.click()
  await expect(page).toHaveURL(/\/connection\//)
})

test('linie GTFS: strona Linie pokazuje sekcje z liniami miasta', async ({ page }) => {
  await page.goto('/city/warszawa/lines')

  await expect(page.getByRole('heading', { level: 1, name: 'Linie', exact: true })).toBeVisible()

  // GTFS mock parsuje się raz przy starcie (~kilkanaście s), strona sama ponawia.
  await expect(page.getByLabel('Numer linii lub przystanek końcowy')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('line-section').first()).toBeVisible()
  // Na wąskim ekranie sekcje startują zwinięte — kafle widać po rozwinięciu pierwszej.
  const first = page.getByTestId('line-section').first()
  if (!(await first.evaluate((node) => (node as HTMLDetailsElement).open))) await first.locator('summary').click()
  await expect(page.getByRole('link', { name: /^Linia / }).first()).toBeVisible()
})

test('tablica → szczegóły → wstecz: bezpośrednie wejście na stację wraca do tablicy', async ({ page }) => {
  // Regresja: `patchUrlParams` (replaceState przy montowaniu) kasował stan
  // historii Next na wpisie załadowanym bezpośrednio, więc „wstecz" zmieniało
  // tylko URL, a widok zostawał na szczegółach połączenia.
  await page.goto(boardUrl)

  const rowButton = page.locator('td button[aria-label]').first()
  await expect(async () => {
    await page.reload()
    await expect(rowButton).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })

  await rowButton.click()
  await expect(page).toHaveURL(/\/connection\//)

  await page.goBack()
  await expect(page).toHaveURL(/\/station\/33605/)
  await expect(page.getByRole('tablist', { name: 'Kierunek' })).toBeVisible()
  // Wiersze wracają z pamięci klienta od razu (cache `usePolling`), bez czekania na nowe
  // zapytanie ani na komunikat „Ładowanie" -- limit << 30 s odświeżania.
  await expect(page.locator('td button[aria-label]').first()).toBeVisible({ timeout: 2_000 })
})

// Start (PR11): znajdź miejsce → przypnij → Wstecz → odjazdy na Starcie.
test('start: znajdź miejsce → przypnij → Wstecz → karta z odjazdami na Starcie', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('main').getByRole('button', { name: 'Stacja, przystanek lub linia' }).click()
  const surface = isDesktop(testInfo.project.name) ? page.getByRole('dialog', { name: 'Szukaj stacji, przystanku lub linii' }) : page.getByRole('main')
  await searchField(surface).fill('Centralna')
  await surface.getByRole('button', { name: /^Warszawa Centralna/ }).first().click({ timeout: 45_000 })
  await expect(page).toHaveURL(/\/station\/33605/)

  await page.getByRole('button', { name: 'Przypnij do Startu' }).first().click()
  await page.goBack()
  // Telefon: Wstecz ze stacji wraca na wyniki `/search` (zakładka), dopiero drugie na Start.
  if (!isDesktop(testInfo.project.name)) {
    await expect(page).toHaveURL(/\/search/)
    await page.goBack()
  }
  await expect(page).toHaveURL(/\/$/)
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Warszawa Centralna' }) })
  await expect(card).toBeVisible()
  await expect(card.getByRole('link', { name: /Wszystkie odjazdy/ })).toHaveAttribute('href', /\/station\/33605/)
})

test('start: lokalizacja tylko po kliknięciu „W pobliżu mnie”', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 52.2297, longitude: 21.0122 })
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number }
    w.__geoCalls = 0
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
    navigator.geolocation.getCurrentPosition = (...args) => {
      w.__geoCalls++
      return original(...args)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0)

  await page.getByRole('button', { name: 'W pobliżu mnie' }).click()
  await expect(page).toHaveURL(/\/city\/warszawa\/map/, { timeout: 45_000 })
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1)
})

test('start: odmowa lokalizacji zostawia opis i wyszukiwanie', async ({ page, context }) => {
  await context.clearPermissions()
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'W pobliżu mnie' }).click()
  await expect(page.getByText('Brak dostępu do lokalizacji. Wyszukaj miejsce powyżej.')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('main').getByRole('button', { name: 'Stacja, przystanek lub linia' })).toBeEnabled()
})

test('start: desktop zachowuje kolumnę boczną ze statystykami, telefon ma „Info”', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible()
  if (isDesktop(testInfo.project.name)) {
    await expect(page.getByRole('complementary', { name: 'Panel kontekstowy' }).getByRole('button', { name: /Dziś w Polsce/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Info', exact: true })).toHaveCount(0)
  } else {
    await expect(page.getByRole('button', { name: 'Info', exact: true })).toBeVisible()
  }
})

test('start: axe w obu motywach z przypiętym zestawem (PKP + przystanek miejski)', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('monitor.favourites.v2', JSON.stringify([
    { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
    { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' },
  ])))
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('article').nth(1).getByRole('link', { name: /Wszystkie odjazdy/ })).toBeVisible({ timeout: 45_000 })
    const { violations } = await scanA11y(page)
    expect(violations.map((v) => `${scheme} ${v.id}: ${v.help}`)).toEqual([])
  }
})
