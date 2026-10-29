import { openPageOptions } from './helpers/page-options'
import { test, expect, type Page } from './helpers/test'
import { scanA11y } from './helpers/axe'

// Strona „Linie”: zwijane sekcje (natywne <details>), szukanie, „Ostatnio oglądane”.
// Mock GTFS ma 11 linii (fixtures/gtfs/warszawa): metro M1/M2, tramwaj 20, kolej S2, autobusy 128/190 (zwykłe),
// 521 (przyspieszona), N16 (nocna), 712 (podmiejska), L-1 (lokalna), Z1 (zastępcza).
// Na wąskim ekranie wszystkie sekcje startują zwinięte, na szerokim te do 30 linii otwarte —
// testy nie zakładają stanu domyślnego, tylko go czytają albo rozwijają wszystko.
const READY = 45_000
const BLOCKING = ['serious', 'critical']
const FIELD = 'Numer linii lub przystanek końcowy'

async function gotoLines(page: Page) {
  await page.goto('/city/warszawa/lines')
  await expect(page.getByRole('heading', { level: 1, name: 'Linie', exact: true })).toBeVisible()
  await expect(page.getByTestId('line-section').first()).toBeVisible({ timeout: READY })
}

async function expandAll(page: Page) {
  for (const testId of ['line-section', 'line-subsection']) {
    // sekcje przed podsekcjami: podsekcja w zwiniętej sekcji jest niewidoczna, klik by zawisł
    const items = page.getByTestId(testId)
    for (let i = 0; i < (await items.count()); i++) {
      const item = items.nth(i)
      if (!(await item.evaluate((node) => (node as HTMLDetailsElement).open))) await item.locator('summary').first().click()
    }
  }
}

test('sekcja zwinięta/rozwinięta przez użytkownika przeżywa odświeżenie strony', async ({ page }) => {
  await gotoLines(page)
  const metro = page.getByTestId('line-section').first()
  const before = await metro.evaluate((node) => (node as HTMLDetailsElement).open)
  await metro.locator('summary').click()
  await expect(metro).toHaveJSProperty('open', !before)
  // The native toggle event persists after the DOM attribute changes; reload only after that write.
  await expect.poll(() => page.evaluate(() => {
    const stored = localStorage.getItem('monitor.linesSections.v1')
    return stored === null ? null : JSON.parse(stored).metro
  })).toBe(!before)

  await page.reload()
  await expect(page.getByTestId('line-section').first()).toBeVisible({ timeout: READY })
  await expect(page.getByTestId('line-section').first()).toHaveJSProperty('open', !before)
})

test('odwiedzona linia pojawia się w „Ostatnio oglądane”', async ({ page }) => {
  await gotoLines(page)
  await expect(page.getByRole('group', { name: 'Ostatnio oglądane' })).toHaveCount(0)

  await expandAll(page)
  await page.getByRole('link', { name: /^Linia M1: / }).click()
  await expect(page).toHaveURL(/\/city\/warszawa\/line\/M1/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })
  // h1 i zapis „Ostatnio oglądane” nie są atomowe: zapis idzie w efekcie (`useEffect`) po
  // commicie, w osobnym zadaniu. Pełna nawigacja tuż po h1 potrafiła zgubić ten efekt
  // (wolny WebKit; odtworzone na Chromium z dławieniem CPU) — czekamy na sam zapis.
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('monitor.recentLines.v1')))
    .toBe(JSON.stringify({ warszawa: ['M1'] }))

  await gotoLines(page)
  const recent = page.getByRole('group', { name: 'Ostatnio oglądane' })
  await expect(recent.getByRole('link', { name: /^Linia M1: / })).toBeVisible()
})

test('szukanie: wynik z plakietką rodzaju, komunikat przy braku wyników', async ({ page }) => {
  await gotoLines(page)
  await page.getByLabel(FIELD).fill('n16')
  const hit = page.getByRole('link', { name: /^Linia N16: / })
  await expect(hit).toBeVisible()
  await expect(hit).toContainText('nocna')
  await expect(page.getByTestId('line-section')).toHaveCount(0)

  await page.getByLabel(FIELD).fill('zzzz')
  await expect(page.getByText('Brak pasujących linii')).toBeVisible()
})

test('kafel linii ma cel dotyku co najmniej 44 px', async ({ page }) => {
  await gotoLines(page)
  await expandAll(page)
  const box = await page.getByRole('link', { name: /^Linia M1: / }).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
})

test('375 px: lista linii nie przewija strony w poziomie', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'pomiar clientWidth na desktop-chromium; mobile ma własny viewport')
  await page.setViewportSize({ width: 375, height: 812 })
  await gotoLines(page)
  await expandAll(page)
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(clientWidth).toBe(375)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a11y: lista linii (wszystkie sekcje rozwinięte) w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} bez naruszeń serious/critical`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    // „Ostatnio oglądane” też ma być w skanie.
    await page.addInitScript(() => window.localStorage.setItem('monitor.recentLines.v1', JSON.stringify({ warszawa: ['N16', 'M1'] })))
    await gotoLines(page)
    await expect(page.getByRole('group', { name: 'Ostatnio oglądane' })).toBeVisible()
    await expandAll(page)

    const { violations } = await scanA11y(page)
    const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  })
}

test('a11y: wyniki szukania w trybie ciemnym bez naruszeń serious/critical', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await gotoLines(page)
  await page.getByLabel(FIELD).fill('d')
  await expect(page.getByRole('heading', { level: 2, name: /^Wyniki/ })).toBeVisible()

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

// ---------------------------------------------------------------------------------------------------------------
// PR7 „05 Linia”: ekran linii bus/tram/metro/rail. Mock: tramwaj 20 ma DWA kierunki (id 0 „Dworzec Centralny”,
// id 1 „Centrum”; po 3 przystanki: Centrum 01 → Rondo ONZ → Dworzec Centralny), M1/S2/128 po jednym kierunku
// i 2 przystankach — „Zmień kierunek” jest więc tylko na 20. Poniżej `lg` (1024 px) jedna sekcja naraz (Trasa/Rozkład),
// od `lg` obie obok siebie, przełącznik schowany.
// ---------------------------------------------------------------------------------------------------------------
const LINE_20 = { routeId: '20', longName: 'Centrum – Dworzec Centralny', mode: 'tramwaj' }
const LINES = [
  LINE_20,
  { routeId: 'M1', longName: 'Kabaty – Młociny', mode: 'metro' },
  { routeId: 'S2', longName: 'Sulejówek Miłosna – Lotnisko Chopina', mode: 'kolej' },
  { routeId: '128', longName: 'Chomiczówka – Dworzec Centralny', mode: 'autobus' },
]

const isDesktop = (testInfo: { project: { name: string } }) => testInfo.project.name === 'desktop-chromium'
const lgUp = (page: Page) => (page.viewportSize()?.width ?? 1280) >= 1024

/** Karta kierunku: etykieta „Kierunek” + pełny headsign (druga linia tekstu karty). */
const directionCard = (page: Page) => page.getByText('Kierunek', { exact: true }).locator('..')
const headsignOf = async (page: Page) =>
  ((await directionCard(page).innerText()).split('\n').map((line) => line.trim()).filter(Boolean)[1] ?? '')
/** Lista trasy = jedyna lista z linkami „Odjazdy z przystanku {nazwa}”. */
const routeList = (page: Page) => page.getByRole('list').filter({ has: page.getByRole('link', { name: /^Odjazdy z przystanku / }) })
const capsule = (page: Page) => page.getByRole('group', { name: 'Wybrany rozkład' })
const paneButton = (page: Page, name: 'Trasa' | 'Rozkład') => page.getByRole('group', { name: 'Widok linii' }).getByRole('button', { name })

async function gotoLine(page: Page, line: { routeId: string; longName: string }, query = '') {
  await page.goto(`/city/warszawa/line/${line.routeId}${query}`)
  await expect(page.getByRole('heading', { level: 1, name: line.longName })).toBeVisible({ timeout: READY })
  await expect(directionCard(page)).toBeVisible()
}

/** Poniżej `lg` otwiera „Rozkład” (od `lg` oba panele są widoczne — nic nie robi). */
async function openTimetable(page: Page) {
  if (lgUp(page)) return
  await paneButton(page, 'Rozkład').click()
  await expect(paneButton(page, 'Rozkład')).toHaveAttribute('aria-pressed', 'true')
  await expect(capsule(page)).toBeVisible()
}

async function expectNoBlockingViolations(page: Page) {
  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
}

const VEHICLE_STATES = [/Pojazdy w tym kierunku: \d+/, /Brak pojazdów w tym kierunku\./, /Brak danych o pozycjach pojazdów/, /Wczytywanie pozycji…/]

test.describe('linia (PR7)', () => {
  test('katalog → linia → kierunek → przystanek → rozkład → tablica przystanku → Wstecz zachowuje kierunek, przystanek i widok', async ({ page }, testInfo) => {
    await gotoLines(page)
    await expandAll(page)
    await page.getByRole('link', { name: /^Linia 20: / }).click()
    await expect(page).toHaveURL(/\/city\/warszawa\/line\/20/)
    await expect(page.getByRole('heading', { level: 1, name: LINE_20.longName })).toBeVisible({ timeout: READY })

    const firstHeadsign = await headsignOf(page)
    expect(firstHeadsign).not.toBe('')
    await page.getByRole('button', { name: 'Zmień kierunek' }).click()
    await expect.poll(() => headsignOf(page)).not.toBe(firstHeadsign)
    await expect(page).toHaveURL(/[?&]dir=\d+/)
    const switched = await headsignOf(page)

    // Drugi przystanek nowego kierunku: nazwa z etykiety linku wiersza (przycisk odmontuje się razem z listą poniżej `lg`).
    const label = await routeList(page).getByRole('link').nth(1).getAttribute('aria-label')
    const stopName = (label ?? '').replace(/^Odjazdy z przystanku /, '')
    expect(stopName).not.toBe('')
    await routeList(page).getByRole('button').nth(1).click()
    await expect(page).toHaveURL(/[?&]stop=\d+/)
    if (!isDesktop(testInfo)) await expect(page).toHaveURL(/[?&]pane=timetable/)

    await expect(capsule(page)).toContainText(stopName)
    await expect(capsule(page)).toContainText(switched)
    const withSelection = page.url()

    await page.getByRole('link', { name: 'Odjazdy z przystanku', exact: true }).click()
    await expect(page).toHaveURL(/\/city\/warszawa\/stop\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })

    await page.goBack()
    await expect(page).toHaveURL(withSelection)
    await expect(page.getByRole('heading', { level: 1, name: LINE_20.longName })).toBeVisible({ timeout: READY })
    await expect(capsule(page)).toContainText(stopName)
    await expect(capsule(page)).toContainText(switched)
    expect(await headsignOf(page)).toBe(switched)
    if (isDesktop(testInfo)) await expect(routeList(page).getByRole('button').nth(1)).toHaveAttribute('aria-pressed', 'true')
  })

  test('błędne parametry URL (?dir=9&stop=zzz&pane=bad&day=x) dają widok domyślny bez błędu', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await gotoLine(page, LINE_20, '?dir=9&stop=zzz&pane=bad&day=x')

    expect(await headsignOf(page)).not.toBe('')
    // `pane=bad` → Trasa; pierwszy przystanek pierwszego kierunku wybrany.
    await expect(routeList(page).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
    expect(await routeList(page).getByRole('button').count()).toBeGreaterThanOrEqual(2)
    if (!lgUp(page)) await expect(paneButton(page, 'Trasa')).toHaveAttribute('aria-pressed', 'true')
    expect(errors).toEqual([])
  })

  for (const line of LINES) {
    test(`linia ${line.routeId} (${line.mode}): nagłówek, kierunek, trasa, komunikaty i pozycje pojazdów`, async ({ page }) => {
      let trainRequests = 0
      page.on('request', (request) => {
        if (request.url().includes('/api/train')) trainRequests += 1
      })
      await gotoLine(page, line)

      await expect(page.getByTestId('line-mode')).toContainText(line.mode)
      expect(await headsignOf(page)).not.toBe('')
      expect(await routeList(page).getByRole('button').count()).toBeGreaterThanOrEqual(2)
      await expect(page.getByRole('heading', { level: 3, name: `Komunikaty linii ${line.routeId}` })).toBeVisible()

      // Pozycje pojazdów: dokładnie jeden z czterech stanów, nigdy błąd (feed mocka działa).
      const vehicles = page.getByRole('region', { name: 'Pojazdy linii' })
      await expect(vehicles).not.toContainText('Wczytywanie pozycji…', { timeout: READY })
      await expect(vehicles).not.toContainText('Nie udało się')
      const text = await vehicles.innerText()
      expect(VEHICLE_STATES.filter((state) => state.test(text))).toHaveLength(1)
      await expect(vehicles.getByRole('link', { name: 'Pojazdy na mapie' })).toBeVisible()

      // GTFS (także kolej miejska S2) nie dotyka PKP: zero /api/train (#13).
      expect(trainRequests).toBe(0)
    })
  }

  test('„Pojazdy na mapie” prowadzi do mapy z linią i kierunkiem, a zmiana kierunku zmienia dir', async ({ page }) => {
    await gotoLine(page, LINE_20)
    const link = page.getByRole('link', { name: 'Pojazdy na mapie' })
    const dirOf = async () => new URL((await link.getAttribute('href')) ?? '', 'http://x').searchParams.get('dir')
    const first = await link.getAttribute('href')
    expect(first).toMatch(/^\/city\/warszawa\/map\?/)
    expect(first).toContain('line=20')
    expect(first).toMatch(/[?&]dir=[01](&|$)/)

    const before = await dirOf()
    await page.getByRole('button', { name: 'Zmień kierunek' }).click()
    await expect.poll(dirOf).not.toBe(before)
    expect(await dirOf()).toMatch(/^[01]$/)
  })

  test('reduced motion: przełączanie Trasa ↔ Rozkład działa i pokazuje treść', async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), 'przełącznik jest tylko poniżej lg; desktop pokazuje oba panele')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoLine(page, LINE_20)
    await expect(routeList(page)).toBeVisible()

    await paneButton(page, 'Rozkład').click()
    await expect(paneButton(page, 'Rozkład')).toHaveAttribute('aria-pressed', 'true')
    await expect(capsule(page)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Odjazdy z przystanku', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/[?&]pane=timetable/)

    await paneButton(page, 'Trasa').click()
    await expect(paneButton(page, 'Trasa')).toHaveAttribute('aria-pressed', 'true')
    await expect(routeList(page)).toBeVisible()
    await expect(page).not.toHaveURL(/pane=/)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    const mode = colorScheme === 'dark' ? 'ciemnym' : 'jasnym'

    test(`a11y: linia 20 z komunikatami w trybie ${mode} bez naruszeń serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: colorScheme === 'dark' ? 'reduce' : 'no-preference' })
      await gotoLine(page, LINE_20)
      await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
      await expectNoBlockingViolations(page)
    })

    test(`a11y: linia 20, otwarty rozkład z wybranym przystankiem w trybie ${mode} bez naruszeń serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await gotoLine(page, LINE_20, '?dir=1&stop=700201')
      await openTimetable(page)
      await expect(capsule(page)).toContainText('Rondo ONZ')
      await expectNoBlockingViolations(page)
    })

    test(`a11y: linia 20, skrót komunikatów i rozwinięty komunikat w trybie ${mode} bez naruszeń serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await gotoLine(page, LINE_20)
      await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
      await page.getByRole('button', { name: /^\d+ komunikat/ }).click()
      await page.getByText('Utrudnienia w kursowaniu linii 20').click()
      // Skrót (aria-hidden) znika po rozwinięciu; pełna treść to akapit.
      await expect(page.getByRole('paragraph').filter({ hasText: 'Testowy alert na linię 20 (fixture mock).' })).toBeVisible()
      await expectNoBlockingViolations(page)
    })
  }

  for (const width of [375, 320]) {
    test(`${width} px: linia nie przewija strony w poziomie (Trasa i Rozkład)`, async ({ page }, testInfo) => {
      test.skip(!isDesktop(testInfo), 'pomiar clientWidth na desktop-chromium; mobile ma własny viewport')
      await page.setViewportSize({ width, height: 812 })
      await gotoLine(page, LINE_20)
      const overflow = () =>
        page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))

      await expect(routeList(page)).toBeVisible()
      let { scrollWidth, clientWidth } = await overflow()
      expect(clientWidth).toBe(width)
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

      await openTimetable(page)
      ;({ scrollWidth, clientWidth } = await overflow())
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    })
  }

  test('telefon: przyciski i wiersze linii mają co najmniej 44 px wysokości', async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), 'cele dotyku dotyczą telefonu')
    await gotoLine(page, LINE_20)
    const height = async (target: ReturnType<Page['locator']>) => Math.round((await target.boundingBox())?.height ?? 0)

    expect(await height(page.getByRole('button', { name: 'Zmień kierunek' }))).toBeGreaterThanOrEqual(44)
    expect(await height(paneButton(page, 'Trasa'))).toBeGreaterThanOrEqual(44)
    expect(await height(paneButton(page, 'Rozkład'))).toBeGreaterThanOrEqual(44)
    const rows = routeList(page).getByRole('button')
    expect(await rows.count()).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < (await rows.count()); i++) expect(await height(rows.nth(i))).toBeGreaterThanOrEqual(44)
    const rowLinks = routeList(page).getByRole('link')
    for (let i = 0; i < (await rowLinks.count()); i++) expect(await height(rowLinks.nth(i))).toBeGreaterThanOrEqual(44)
    await page.getByRole('link', { name: 'Pojazdy na mapie' }).scrollIntoViewIfNeeded()
    expect(await height(page.getByRole('link', { name: 'Pojazdy na mapie' }))).toBeGreaterThanOrEqual(44)

    await openTimetable(page)
    expect(await height(page.getByRole('link', { name: 'Odjazdy z przystanku', exact: true }))).toBeGreaterThanOrEqual(44)
  })

  test('zmiana motywu zachowuje dir/stop/pane i wybrany przystanek oraz nie pobiera linii ponownie', async ({ page, browserName }) => {
    const initialTimetableRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/api/gtfs/line' && url.searchParams.get('stop') === '700201') initialTimetableRequests.push(url.href)
    })
    const timetableReady = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/gtfs/line' && url.searchParams.get('stop') === '700201' && response.ok()
    })
    await gotoLine(page, LINE_20, '?dir=1&stop=700201')
    await timetableReady
    expect(initialTimetableRequests).toHaveLength(1)
    // Alerty znane = drabinka ponowień skończona; dopiero wtedy liczymy żądania.
    await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
    const selected = routeList(page).getByRole('button', { pressed: true })
    await expect(selected).toHaveCount(1)
    const selectedText = await selected.innerText()
    const before = new URL(page.url()).search

    let lineRequests = 0
    page.on('request', (request) => {
      if (request.url().includes('/api/gtfs/line')) lineRequests += 1
    })
    const options = await openPageOptions(page)
    const toggle = options.getByRole('button', { name: /^Przełącz na tryb/ })
    const nameBefore = await toggle.getAttribute('aria-label')
    await toggle.click()
    await expect(toggle).not.toHaveAttribute('aria-label', nameBefore ?? '')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', nameBefore ?? '')

    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(routeList(page).getByRole('button', { pressed: true })).toHaveCount(1)
    await page.setViewportSize({ width: 375, height: 812 })
    expect(new URL(page.url()).search).toBe(before)
    await expect(routeList(page).getByRole('button', { pressed: true })).toHaveCount(1)
    expect(await routeList(page).getByRole('button', { pressed: true }).innerText()).toBe(selectedText)
    // WebKit: wolniejsze pierwsze odpowiedzi — zwykłe ponowienie drabinką bywa w tym oknie, więc zliczamy tylko w Chromium.
    if (browserName !== 'webkit') expect(lineRequests).toBe(0)
  })
})

// Catalog keeps search and expandable mode sections; retired mode URLs never narrow the catalog.
test.describe('Katalog linii', () => {
  const field = (page: Page) => page.getByRole('searchbox', { name: FIELD })
  const line = (page: Page, number: string) => page.getByRole('link', { name: new RegExp('^Linia ' + number + ': ') })
  async function catalog(page: Page, query = '') {
    await page.goto('/city/warszawa/lines' + query)
    await expect(field(page)).toBeVisible({ timeout: READY })
  }
  for (const mode of ['metro', 'tram', 'bus', 'rail']) {
    test('legacy mode=' + mode + ' keeps all sections and no transport filter controls', async ({ page }) => {
      await catalog(page, '?mode=' + mode + '&foo=1')
      await expect(page.getByTestId('line-section')).toHaveCount(4)
      await expect(page.getByRole('group', { name: 'Rodzaj komunikacji' })).toHaveCount(0)
      await expect.poll(() => new URL(page.url()).searchParams.get('mode')).toBeNull()
      expect(new URL(page.url()).searchParams.get('foo')).toBe('1')
      await expandAll(page)
      for (const number of ['M1', '20', '128', 'S2']) await expect(line(page, number)).toBeVisible()
    })
  }
  for (const number of ['M1', '20', 'S2', '128', 'N16', 'L-1']) {
    test('search and Back preserve catalog query for ' + number, async ({ page }) => {
      await catalog(page)
      await field(page).fill(number.toLowerCase())
      await line(page, number).click()
      await expect(page).toHaveURL(new RegExp('/city/warszawa/line/' + number))
      await page.goBack()
      await expect(field(page)).toHaveValue(number.toLowerCase(), { timeout: READY })
      await expect(line(page, number).first()).toBeVisible()
    })
  }
  test('query survives reload, replace preserves history and unrelated parameters; clear restores sections', async ({ page }) => {
    await catalog(page, '?foo=1')
    const before = await page.evaluate(() => history.length)
    await field(page).fill('n16')
    expect(await page.evaluate(() => history.length)).toBe(before)
    await page.reload()
    await expect(field(page)).toHaveValue('n16', { timeout: READY })
    await expect(line(page, 'N16')).toBeVisible()
    await page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click()
    await expect(field(page)).toHaveValue('')
    await expect(page.getByTestId('line-section')).toHaveCount(4)
    expect(new URL(page.url()).searchParams.get('foo')).toBe('1')
    expect(new URL(page.url()).searchParams.has('q')).toBe(false)
  })
  test('no match can clear the query and restore every section', async ({ page }) => {
    await catalog(page, '?mode=bus&q=zzzz')
    await expect(page.getByText('Brak pasujących linii')).toBeVisible()
    await page.getByRole('button', { name: 'Wyczyść filtry' }).click()
    await expect(field(page)).toHaveValue('')
    await expect(page.getByTestId('line-section')).toHaveCount(4)
    expect(new URL(page.url()).searchParams.has('mode')).toBe(false)
  })
  test('theme and reduced motion preserve search and stored section collapse without another catalog request', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let requests = 0
    page.on('request', (request) => { if (request.url().includes('/api/gtfs/lines')) requests++ })
    await catalog(page, '?q=dworzec')
    await expect(line(page, 'N16')).toBeVisible()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(field(page)).toHaveValue('dworzec')
    expect(requests).toBe(1)
    await page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click()
    const metro = page.getByTestId('line-section').filter({ has: page.locator('summary').filter({ hasText: 'Metro' }) })
    if (await metro.evaluate((el) => (el as HTMLDetailsElement).open)) await metro.locator('summary').click()
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(metro).toHaveJSProperty('open', false)
  })
  test('320 px: long termini wrap in sections and search results without horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewport measurement on desktop project')
    await page.setViewportSize({ width: 320, height: 700 })
    await page.route('**/api/gtfs/lines*', async (route) => {
      const response = await route.fetch()
      const json = await response.json()
      json.lines.bus[0].longName = 'Ulica'.repeat(14)
      await route.fulfill({ response, json })
    })
    await catalog(page)
    await expandAll(page)
    for (const query of ['', 'ulica']) {
      await field(page).fill(query)
      await expect(page.getByRole('link', { name: /^Linia / }).first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    }
  })
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const query of ['', '?q=dworzec', '?mode=bus&q=dworzec']) {
      test('a11y catalog ' + colorScheme + ' ' + query, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await catalog(page, query)
        if (query === '') await expandAll(page)
        const { violations } = await scanA11y(page)
        expect(violations.filter((v) => BLOCKING.includes(v.impact ?? ''))).toEqual([])
      })
    }
  }
})
// ---------------------------------------------------------------------------------------------------------------
// PR8 „09 Rozkład”: kategoria dnia w rozkładzie linii. Poniżej `lg` jedna kategoria naraz (chipy „Kategoria dnia”),
// od `lg` wszystkie kolumny obok siebie. Linia 20 ma w mocku dni robocze i soboty (bez niedziel), kierunek 0 startuje
// z „Centrum 01”; „Rondo ONZ” leży +6 min od startu. Kursy „wd” mocka jadą w DZISIEJSZEJ kategorii dnia (zależnej od dnia
// tygodnia), sobotnie (token SbS) zawsze w „Soboty” — testy opierają się na sobocie i nie zakładają kursów w „Dni robocze”.
// ---------------------------------------------------------------------------------------------------------------
test.describe('konkretny rozkład linii (ADR0013 PR06)', () => {
  const dayChips = (page: Page) => page.getByRole('group', { name: 'Kategoria dnia' })
  const dayColumn = (page: Page, name: string) => page.getByRole('group', { name, exact: true })
  const columns = ['Poniedziałek – Piątek', 'Sobota', 'Niedziela i święta']

  async function openTimetableAt(page: Page, query: string) {
    await gotoLine(page, LINE_20, query)
    await openTimetable(page)
    await expect(dayColumn(page, query.includes('day=saturday') ? 'Sobota' : 'Poniedziałek – Piątek')).toBeVisible({ timeout: READY })
  }

  test('katalog → linia → przystanek → sobota → minuta otwiera rzeczywisty kurs z mapą i godzinami', async ({ page }) => {
    await gotoLines(page)
    await expandAll(page)
    await page.getByRole('link', { name: /^Linia 20: / }).click()
    await expect(page.getByRole('heading', { level: 1, name: LINE_20.longName })).toBeVisible({ timeout: READY })
    await routeList(page).getByRole('button', { name: /Rondo ONZ/ }).click()
    await expect(capsule(page)).toContainText('Rondo ONZ')
    if (!lgUp(page)) await dayChips(page).getByRole('button', { name: 'Sobota', exact: true }).click()
    await dayColumn(page, 'Sobota').getByRole('link', { name: /^08:06,/ }).click()
    await expect(page).toHaveURL(/trip=20-sa-0-1/)
    await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
    await expect(routeList(page)).toContainText('08:06')
    await expect(routeList(page)).toContainText('08:12')
    await expect(page.getByRole('heading', { name: 'Mapa kursu', exact: true })).toBeVisible()
    await page.reload()
    await expect(routeList(page)).toContainText('08:12')
  })

  test('telefon: jedna kategoria naraz; desktop: wszystkie kolumny obok siebie, puste kategorie opisane', async ({ page }) => {
    await openTimetableAt(page, '')
    if (lgUp(page)) {
      const boxes = await Promise.all(columns.map((name) => dayColumn(page, name).boundingBox()))
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x)
      expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x)
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2)
    } else {
      await expect(dayColumn(page, 'Sobota')).toBeHidden()
    }
    for (const name of columns) {
      if (!lgUp(page)) await dayChips(page).getByRole('button', { name, exact: true }).click()
      const column = dayColumn(page, name)
      await expect(column).toBeVisible()
      expect((await column.getByRole('link').count()) + (await column.getByText('Brak kursów w tej kategorii dnia.').count())).toBeGreaterThan(0)
    }
  })

  test('telefon: minuty i chipy dnia mają co najmniej44px', async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), 'cele dotyku dotyczą telefonu')
    await openTimetableAt(page, '?day=saturday')
    for (const target of [dayChips(page).getByRole('button'), dayColumn(page, 'Sobota').getByRole('link')]) {
      expect(await target.count()).toBeGreaterThan(1)
      for (let i = 0; i < await target.count(); i++) {
        const box = (await target.nth(i).boundingBox())!
        expect(Math.round(box.width)).toBeGreaterThanOrEqual(44)
        expect(Math.round(box.height)).toBeGreaterThanOrEqual(44)
      }
    }
  })

  for (const width of [375, 320]) {
    test(`${width}px: wszystkie kategorie bez overflow także przy tekście200%`, async ({ page }, testInfo) => {
      test.skip(!isDesktop(testInfo), 'kontrolowany viewport desktop-chromium')
      await page.setViewportSize({ width, height: 812 })
      await openTimetableAt(page, '')
      for (const name of columns) {
        await dayChips(page).getByRole('button', { name, exact: true }).click()
        await expect(dayColumn(page, name)).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      await dayChips(page).getByRole('button', { name: 'Poniedziałek – Piątek', exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    })
  }

  test('klawiatura: chip dnia Spacją zachowuje fokus, minuta Enterem otwiera kurs', async ({ page }) => {
    await openTimetableAt(page, '')
    if (!lgUp(page)) {
      const saturday = dayChips(page).getByRole('button', { name: 'Sobota', exact: true })
      await saturday.focus()
      await page.keyboard.press('Space')
      await expect(saturday).toHaveAttribute('aria-pressed', 'true')
      await expect(saturday).toBeFocused()
    }
    const selectedCourse = dayColumn(page, 'Sobota').getByRole('link').first()
    // Current-day fixture trip IDs (20-wd-*) do not define their calendar-derived day category.
    const courseHref = await selectedCourse.getAttribute('href')
    expect(courseHref).not.toBeNull()
    await selectedCourse.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new URL(courseHref!, page.url()).href)
    await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
  })

  test('?day=saturday odtwarza kategorię; zmiana dnia zachowuje kierunek i przystanek', async ({ page }) => {
    await openTimetableAt(page, '?dir=1&stop=700201&day=saturday')
    if (!lgUp(page)) {
      const saturday = dayChips(page).getByRole('button', { name: 'Sobota', exact: true })
      await expect(saturday).toHaveAttribute('aria-pressed', 'true')
      await dayChips(page).getByRole('button', { name: 'Poniedziałek – Piątek', exact: true }).click()
      await expect(page).not.toHaveURL(/[?&]day=/)
    }
    await expect(page).toHaveURL(/[?&]dir=1/)
    await expect(page).toHaveURL(/[?&]stop=700201/)
    await expect(capsule(page)).toContainText('Rondo ONZ')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`a11y: sobotni kurs w motywie ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await openTimetableAt(page, '?stop=700201&day=saturday')
      await dayColumn(page, 'Sobota').getByRole('link', { name: /^08:06,/ }).click()
      await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
      await expectNoBlockingViolations(page)
    })
  }
})
