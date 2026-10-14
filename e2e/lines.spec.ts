import { test, expect, type Page } from './helpers/test'
import { scanA11y } from './helpers/axe'

// Strona „Linie”: zwijane sekcje (natywne <details>), szukanie, „Ostatnio oglądane”.
// Mock GTFS ma 11 linii (fixtures/gtfs/warszawa): metro M1/M2, tramwaj 20, kolej S2, autobusy 128/190 (zwykłe),
// 521 (przyspieszona), N16 (nocna), 712 (podmiejska), L-1 (lokalna), Z1 (zastępcza).
// Na wąskim ekranie wszystkie sekcje startują zwinięte, na szerokim te do 30 linii otwarte —
// testy nie zakładają stanu domyślnego, tylko go czytają albo rozwijają wszystko.
const READY = 45_000
const BLOCKING = ['serious', 'critical']

async function gotoLines(page: Page) {
  await page.goto('/city/warszawa/lines')
  await expect(page.getByRole('heading', { level: 1, name: 'Linie — Warszawa' })).toBeVisible()
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
  await page.getByLabel('Szukaj linii').fill('n16')
  const hit = page.getByRole('link', { name: /^Linia N16: / })
  await expect(hit).toBeVisible()
  await expect(hit).toContainText('nocna')
  await expect(page.getByTestId('line-section')).toHaveCount(0)

  await page.getByLabel('Szukaj linii').fill('zzzz')
  await expect(page.getByText('Brak linii pasujących do wyszukiwania.')).toBeVisible()
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
  await page.getByLabel('Szukaj linii').fill('d')
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
    await gotoLine(page, LINE_20, '?dir=1&stop=700201')
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
    const toggle = page.getByRole('button', { name: /^Przełącz na tryb/ }).first()
    const nameBefore = await toggle.getAttribute('aria-label')
    await toggle.click()
    await expect(toggle).not.toHaveAttribute('aria-label', nameBefore ?? '')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', nameBefore ?? '')

    expect(new URL(page.url()).search).toBe(before)
    await expect(routeList(page).getByRole('button', { pressed: true })).toHaveCount(1)
    expect(await routeList(page).getByRole('button', { pressed: true }).innerText()).toBe(selectedText)
    // WebKit: wolniejsze pierwsze odpowiedzi — zwykłe ponowienie drabinką bywa w tym oknie, więc zliczamy tylko w Chromium.
    if (browserName !== 'webkit') expect(lineRequests).toBe(0)
  })
})
