import { changeTheme } from './helpers/page-options'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { isDesktop, openSearch, searchField } from './helpers/search'

// Wspólne wyszukiwanie „Stacja, przystanek lub linia" (`UnifiedSearch`): na telefonie strona `/search`
// (wejście z dolnego paska), od `sm` okno (Ctrl+K). Te same scenariusze biegną na obu powierzchniach;
// to, co dotyczy adresu (`?q=`, Wstecz), tylko na telefonie. Mock: stacja PKP „Warszawa Centralna" (33605),
// zespół „Centrum" (1001), linie warszawskie z `fixtures/gtfs/warszawa/routes.txt`.
const READY = 45_000
const RAIL_ROW = /^Warszawa Centralna, Stacja kolejowa PKP/
const STOP_ROW = /^Centrum, Zespół przystanków · Warszawa/
const NO_RESULTS = 'Brak wyników dla tej frazy'
const PLACES_HINT = 'Wpisz co najmniej 3 znaki, aby znaleźć miejsca'
const SEARCH_API = /\/api\/search(\?|$)/

/** Powierzchnia wyszukiwania: desktop = okno otwarte skrótem, telefon = strona `/search` (bez wchodzenia przez pasek). */
async function openSurface(page: Page, project: string): Promise<Locator> {
  if (isDesktop(project)) {
    await page.goto('/')
    return openSearch(page, project)
  }
  await page.goto('/search')
  await page.waitForLoadState('networkidle') // pole kontrolowane: wpis przed hydracją przepada
  const surface = page.getByRole('main')
  await expect(searchField(surface)).toBeVisible()
  return surface
}

/** Zlicza zapytania o miejsca (`/api/search`), przepuszczając je dalej. */
async function countSearchCalls(page: Page): Promise<{ urls: string[] }> {
  const urls: string[] = []
  await page.route(SEARCH_API, (route) => {
    urls.push(route.request().url())
    return route.continue()
  })
  return { urls }
}

// ── wejście i progi znaków ──────────────────────────────────────────────────

test('telefon: „Szukaj" z dolnego paska prowadzi na /search z jednym h1 „Szukaj" i fokusem w polu', async ({ page }, testInfo) => {
  test.skip(isDesktop(testInfo.project.name), 'dolny pasek tylko poniżej sm')

  await page.goto('/')
  const surface = await openSearch(page, testInfo.project.name)
  await expect(page).toHaveURL(/\/search$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Szukaj')
  await expect(searchField(surface)).toBeFocused()
})

test('1 znak znajduje linię bez pytania o miejsca; 2 znaki podpowiadają „co najmniej 3"; 3 znaki uruchamiają miejsca', async ({ page }, testInfo) => {
  const calls = await countSearchCalls(page)
  const surface = await openSurface(page, testInfo.project.name)
  const field = searchField(surface)

  await field.fill('2')
  await expect(surface.getByRole('button', { name: /^Linia 20, / })).toBeVisible({ timeout: READY })
  await expect(surface.getByRole('heading', { name: 'Linie' })).toBeVisible()
  await field.fill('M')
  await expect(surface.getByRole('button', { name: /^Linia M1, / })).toBeVisible()
  await expect(surface.getByRole('button', { name: /^Linia M2, / })).toBeVisible()

  await field.fill('Ce')
  await expect(surface.getByText(PLACES_HINT)).toBeVisible()
  await expect(surface.getByRole('heading', { name: 'Stacje kolejowe' })).toHaveCount(0)
  // Debounce miejsc to 300 ms: dopiero po nim zapytanie MOGŁOBY wyjść — brak wywołania to asercja negatywna.
  await page.waitForTimeout(600)
  expect(calls.urls).toEqual([])

  await field.fill('Cen')
  await expect(surface.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
  await expect(surface.getByText(PLACES_HINT)).toHaveCount(0)
  expect(calls.urls.length).toBeGreaterThan(0)
})

// ── trzy rodzaje wyników ────────────────────────────────────────────────────

const KINDS: { name: string; query: string; row: RegExp; url: RegExp }[] = [
  { name: 'stacja kolejowa → /station/33605', query: 'Centr', row: RAIL_ROW, url: /\/station\/33605/ },
  { name: 'przystanek → /city/warszawa/stop/1001', query: 'Centr', row: STOP_ROW, url: /\/city\/warszawa\/stop\/1001/ },
  { name: 'linia → /city/warszawa/line/20', query: '20', row: /^Linia 20, /, url: /\/city\/warszawa\/line\/20$/ },
]

for (const kind of KINDS) {
  test(`wynik otwiera właściwy ekran: ${kind.name}; na telefonie Wstecz wraca na /search?q= z frazą w polu`, async ({ page }, testInfo) => {
    const surface = await openSurface(page, testInfo.project.name)
    await searchField(surface).fill(kind.query)
    await surface.getByRole('button', { name: kind.row }).click({ timeout: READY })
    await expect(page).toHaveURL(kind.url)

    if (isDesktop(testInfo.project.name)) {
      await expect(page.getByRole('dialog')).not.toBeVisible() // wybór zamyka okno
      return
    }
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${kind.query}$`))
    const restored = page.getByRole('main')
    await expect(searchField(restored)).toHaveValue(kind.query)
    await expect(restored.getByRole('button', { name: kind.row })).toBeVisible({ timeout: READY })
  })
}

test('fraza trafia do adresu przez replace: jeden Wstecz opuszcza /search, nie cofa liter', async ({ page }, testInfo) => {
  test.skip(isDesktop(testInfo.project.name), 'okno desktopu nie ma adresu')

  await page.goto('/')
  const surface = await openSearch(page, testInfo.project.name)
  await searchField(surface).pressSequentially('Cent')
  await expect(page).toHaveURL(/\/search\?q=Cent$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

// ── bez miasta, awarie źródeł ───────────────────────────────────────────────

test('lista miast nie wczytana: stacje PKP nadal się wyszukują (zapytanie bez city), komunikat „Nie udało się wczytać listy miast" i „Spróbuj ponownie"', async ({ page }, testInfo) => {
  await page.route('**/api/cities', (route) => route.fulfill({ status: 500, json: { error: 'x' } }))
  const calls = await countSearchCalls(page)
  const surface = await openSurface(page, testInfo.project.name)
  await searchField(surface).fill('Warsz')

  await expect(surface.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
  await expect(surface.getByText('Nie udało się wczytać listy miast')).toBeVisible()
  await expect(surface.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible()
  await expect(surface.getByText('Wybierz miasto')).toHaveCount(0)
  await expect(surface.getByRole('heading', { name: 'Przystanki' })).toHaveCount(0)
  await expect(surface.getByText(NO_RESULTS)).toHaveCount(0)
  expect(calls.urls.every((url) => !url.includes('city='))).toBe(true)
})

test('ponowienie po awarii listy miast przywraca przystanki i zostawia fokus w polu', async ({ page }, testInfo) => {
  let failing = true
  await page.route('**/api/cities', (route) => (failing ? route.fulfill({ status: 500, json: { error: 'x' } }) : route.continue()))
  const surface = await openSurface(page, testInfo.project.name)
  const field = searchField(surface)
  await field.fill('Centr')
  await expect(surface.getByText('Nie udało się wczytać listy miast')).toBeVisible({ timeout: READY })

  failing = false
  await surface.getByRole('button', { name: 'Spróbuj ponownie' }).click()
  await expect(surface.getByRole('button', { name: STOP_ROW })).toBeVisible({ timeout: READY })
  await expect(surface.getByText('Nie udało się wczytać listy miast')).toHaveCount(0)
  await expect(surface.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0)
  await expect(field).toBeFocused()
})

test('telefon: nieznane ?city= nie wysyła żądań o linie nieistniejącego miasta; wraca do zapamiętanego/domyślnego', async ({ page }, testInfo) => {
  test.skip(isDesktop(testInfo.project.name), 'adres ?city= tylko na stronie /search')
  const lineCalls: string[] = []
  await page.route(/\/api\/gtfs\/lines/, (route) => {
    lineCalls.push(route.request().url())
    return route.continue()
  })
  await page.goto('/search?city=zzz')
  await page.waitForLoadState('networkidle')
  const main = page.getByRole('main')
  await searchField(main).fill('20')
  await expect(main.getByRole('button', { name: /^Linia 20, / })).toBeVisible({ timeout: READY })
  expect(lineCalls.filter((url) => url.includes('city=zzz'))).toEqual([])
})

test('częściowa awaria: stacje kolejowe nie wczytane, przystanek zostaje, jest „Spróbuj ponownie", nie ma „Brak wyników"', async ({ page }, testInfo) => {
  await page.route(SEARCH_API, (route) =>
    route.fulfill({
      status: 200,
      json: { stations: [{ id: '1001', name: 'Centrum', kind: 'transit', mode: 'bus' }], sources: { rail: 'failed', transit: 'ready' } },
    }),
  )
  const surface = await openSurface(page, testInfo.project.name)
  await searchField(surface).fill('Centr')

  await expect(surface.getByText('Nie udało się wczytać stacji kolejowych')).toBeVisible({ timeout: READY })
  await expect(surface.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible()
  await expect(surface.getByRole('button', { name: STOP_ROW })).toBeVisible() // sprawne źródło nie znika przez cudzy błąd
  await expect(surface.getByText(NO_RESULTS)).toHaveCount(0)
})

test('awaria stacji kolejowych bez żadnego wyniku: „Nie udało się wczytać…", nie „Brak wyników"; ponowienie dociąga wyniki', async ({ page }, testInfo) => {
  let first = true
  await page.route(SEARCH_API, (route) => {
    if (!first) return route.continue()
    first = false
    return route.fulfill({ status: 200, json: { stations: [], sources: { rail: 'failed', transit: 'ready' } } })
  })
  const surface = await openSurface(page, testInfo.project.name)
  await searchField(surface).fill('Warsz')

  await expect(surface.getByText('Nie udało się wczytać stacji kolejowych')).toBeVisible({ timeout: READY })
  await expect(surface.getByText(NO_RESULTS)).toHaveCount(0)
  await surface.getByRole('button', { name: 'Spróbuj ponownie' }).click()
  await expect(surface.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
  await expect(surface.getByText('Nie udało się wczytać stacji kolejowych')).toHaveCount(0)
  await expect(surface.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0)
})

test('HTTP 500 z /api/search: oba źródła miejsc „Nie udało się wczytać", „Spróbuj ponownie", nie „Brak wyników"', async ({ page }, testInfo) => {
  await page.route(SEARCH_API, (route) => route.fulfill({ status: 500, json: { error: 'x' } }))
  const surface = await openSurface(page, testInfo.project.name)
  await searchField(surface).fill('Warsz')

  await expect(surface.getByText('Nie udało się wczytać stacji kolejowych')).toBeVisible({ timeout: READY })
  await expect(surface.getByText('Nie udało się wczytać przystanków')).toBeVisible()
  await expect(surface.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible()
  await expect(surface.getByText(NO_RESULTS)).toHaveCount(0)
})

test('poprawna fraza bez trafień: „Brak wyników dla tej frazy" (a nie błąd)', async ({ page }, testInfo) => {
  const surface = await openSurface(page, testInfo.project.name)
  await searchField(surface).fill('Zzzzz')
  await expect(surface.getByText(NO_RESULTS)).toBeVisible({ timeout: READY })
  await expect(surface.getByText(/Nie udało się wczytać/)).toHaveCount(0)
  await expect(surface.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0)
})

// ── wszystkie rodzaje linii ─────────────────────────────────────────────────

const LINES: { query: string; label: string; routeId: string }[] = [
  { query: '128', label: 'Linia 128, Chomiczówka – Dworzec Centralny, Autobus · Warszawa', routeId: '128' },
  { query: 'N16', label: 'Linia N16, Dworzec Centralny – Bemowo, Autobus · Warszawa', routeId: 'N16' },
  { query: '20', label: 'Linia 20, Centrum – Dworzec Centralny, Tramwaj · Warszawa', routeId: '20' },
  { query: 'M1', label: 'Linia M1, Kabaty – Młociny, Metro · Warszawa', routeId: 'M1' },
  { query: 'M2', label: 'Linia M2, Bemowo – Bródno, Metro · Warszawa', routeId: 'M2' },
  { query: 'S2', label: 'Linia S2, Sulejówek Miłosna – Lotnisko Chopina, Kolej miejska · Warszawa', routeId: 'S2' },
]

for (const { query, label, routeId } of LINES) {
  test(`linia ${query}: wynik z kontekstem rodzaju i miasta otwiera /city/warszawa/line/${routeId}`, async ({ page }, testInfo) => {
    const surface = await openSurface(page, testInfo.project.name)
    await searchField(surface).fill(query)
    await expect(surface.getByRole('heading', { name: 'Linie' })).toBeVisible({ timeout: READY })
    await surface.getByRole('button', { name: label, exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`/city/warszawa/line/${routeId}$`))
    // Kolej miejska (GTFS) to rodzina tras `line`, nigdy tablica PKP ani połączenie.
    await expect(page).not.toHaveURL(/\/(station|connection)\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })
  })
}

// ── a11y (axe) obu motywów, stany strony /search ────────────────────────────

const BLOCKING = ['serious', 'critical']

async function expectNoBlocking(page: Page): Promise<void> {
  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe /search (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
    })

    async function openPage(page: Page): Promise<Locator> {
      await page.goto('/search')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      const main = page.getByRole('main')
      await expect(searchField(main)).toBeVisible()
      return main
    }

    test('puste pole: instrukcja', async ({ page }) => {
      const main = await openPage(page)
      await expect(main.getByText('Wpisz nazwę stacji, przystanku albo numer linii')).toBeVisible()
      await expectNoBlocking(page)
    })

    test('puste pole: „Ostatnio oglądane"', async ({ page }) => {
      await page.goto('/city/warszawa/stop/1001')
      await expect
        .poll(() => page.evaluate(() => window.localStorage.getItem('monitor.recentPlaces.v1')), { timeout: READY })
        .toContain('Centrum')
      const main = await openPage(page)
      await expect(main.getByRole('region', { name: 'Ostatnio oglądane' }).getByRole('link', { name: 'Centrum' })).toBeVisible()
      await expectNoBlocking(page)
    })

    test('wyniki: stacje, przystanki i linie', async ({ page }) => {
      const main = await openPage(page)
      await searchField(main).fill('Centr')
      for (const heading of ['Stacje kolejowe', 'Przystanki', 'Linie']) await expect(main.getByRole('heading', { name: heading })).toBeVisible({ timeout: READY })
      await expectNoBlocking(page)
    })

    test('wyniki: krótka lista (stacja PKP)', async ({ page }) => {
      const main = await openPage(page)
      await searchField(main).fill('Warsz')
      await expect(main.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
      await expectNoBlocking(page)
    })

    test('brak wyników', async ({ page }) => {
      const main = await openPage(page)
      await searchField(main).fill('Zzzzz')
      await expect(main.getByText(NO_RESULTS)).toBeVisible({ timeout: READY })
      await expectNoBlocking(page)
    })

    test('częściowa awaria', async ({ page }) => {
      await page.route(SEARCH_API, (route) =>
        route.fulfill({
          status: 200,
          json: { stations: [{ id: '1001', name: 'Centrum', kind: 'transit', mode: 'bus' }], sources: { rail: 'failed', transit: 'ready' } },
        }),
      )
      const main = await openPage(page)
      await searchField(main).fill('Centr')
      await expect(main.getByText('Nie udało się wczytać stacji kolejowych')).toBeVisible({ timeout: READY })
      await expect(main.getByRole('button', { name: STOP_ROW })).toBeVisible()
      await expectNoBlocking(page)
    })
  })
}

// ── ruch i motyw ────────────────────────────────────────────────────────────

test('reduced motion: wyniki są dostępne od razu, bez trwających animacji listy', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const surface = await openSurface(page, testInfo.project.name)
  await searchField(surface).fill('Centr')
  const section = surface.locator('section').filter({ has: page.getByRole('heading', { name: 'Stacje kolejowe' }) })
  const row = section.getByRole('button', { name: RAIL_ROW })
  await expect(row).toBeVisible({ timeout: READY })
  expect(await row.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1)
  expect(await section.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0)
})

test('zmiana motywu systemu przy wynikach zachowuje frazę, wyniki i fokus oraz nie ponawia zapytania', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const calls = await countSearchCalls(page)
  const surface = await openSurface(page, testInfo.project.name)
  const field = searchField(surface)
  await field.fill('Centr')
  await expect(surface.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
  await expect(field).toBeFocused()
  const before = calls.urls.length
  expect(before).toBeGreaterThan(0)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  // Debounce miejsc to 300 ms: ewentualne ponowne zapytanie wyszłoby w tym oknie.
  await page.waitForTimeout(600)
  await expect(field).toHaveValue('Centr')
  await expect(field).toBeFocused()
  await expect(surface.getByRole('button', { name: RAIL_ROW })).toBeVisible()
  await expect(surface.getByRole('button', { name: STOP_ROW })).toBeVisible()
  expect(calls.urls.length).toBe(before)
})

test('historia wyszukiwania mieści się przy 320 px i tekście 200%, a Wyczyść oddaje fokus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]))
  })
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/search')
    const clear = page.getByRole('button', { name: 'Wyczyść', exact: true })
    await expect(clear).toBeVisible()
    await expect(page.locator('html')).toHaveClass(new RegExp(theme))
    // iOS: zamykamy istniejącą podpowiedź instalacji, zanim powiększymy treść pod nią.
    const installHint = page.getByRole('button', { name: 'Zamknij podpowiedź instalacji' })
    if (await installHint.isVisible()) await installHint.click()
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await clear.click()
    await expect(searchField(page.getByRole('main'))).toBeFocused()
  }
})

test('ręczny przełącznik motywu na /search zachowuje frazę i wyniki bez nowego zapytania', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const calls = await countSearchCalls(page)
  await page.goto('/search')
  await page.waitForLoadState('networkidle')
  const main = page.getByRole('main')
  await searchField(main).fill('Centr')
  await expect(main.getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
  const before = calls.urls.length

  await changeTheme(page, 'Przełącz na tryb ciemny')
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  await page.waitForTimeout(600)
  await expect(searchField(main)).toHaveValue('Centr')
  await expect(main.getByRole('button', { name: RAIL_ROW })).toBeVisible()
  expect(calls.urls.length).toBe(before)
})
