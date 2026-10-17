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

// PR9 „08 Katalog linii”: tryby (metro / tramwaj / autobus / kolej miejska) jako równorzędne filtry, stan w adresie
// (`q`, `mode`), Wstecz, motyw, 320 px, ograniczony ruch. Zmiana miasta nie ma testu e2e: mock ma jedno miasto —
// reset q/mode/wyników (`key={city}`) pokrywa test jednostkowy strony.
test.describe('Katalog linii (PR9)', () => {
  // Mock Warszawy: metro M1/M2, tramwaj 20, kolej S2, autobusy 128/190/521/N16/712/L-1/Z1.
  const MODES = [
    { mode: 'metro', chip: 'Metro', total: 2, present: 'M1', absent: '20' },
    { mode: 'tram', chip: 'Tramwaje', total: 1, present: '20', absent: 'M1' },
    { mode: 'bus', chip: 'Autobusy', total: 7, present: '128', absent: 'S2' },
    { mode: 'rail', chip: 'Kolej miejska', total: 1, present: 'S2', absent: '128' },
  ] as const
  const A11Y_VIEWS = ['?mode=bus', '?mode=metro', '?mode=tram', '?mode=rail', '?q=dworzec', '?mode=bus&q=dworzec']

  const searchbox = (page: Page) => page.getByRole('searchbox', { name: FIELD })
  const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Rodzaj komunikacji' }).getByRole('button', { name, exact: true })
  const lineLink = (page: Page, line: string) => page.getByRole('link', { name: new RegExp(`^Linia ${line}: `) })
  const anyLineLinks = (page: Page) => page.getByRole('link', { name: /^Linia / })
  const param = (page: Page, name: string) => new URL(page.url()).searchParams.get(name)

  async function gotoCatalog(page: Page, search = '') {
    await page.goto(`/city/warszawa/lines${search}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Linie', exact: true })).toBeVisible()
    await expect(searchbox(page)).toBeVisible({ timeout: READY })
  }

  async function expectNoBlocking(page: Page) {
    const { violations } = await scanA11y(page)
    const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  }

  /** Motyw przełączony systemowo (`next-themes` domyślnie słucha `prefers-color-scheme`); czekamy na klasę, nie na czas. */
  async function switchTheme(page: Page, scheme: 'light' | 'dark') {
    await page.emulateMedia({ colorScheme: scheme })
    await expect(page.locator('html')).toHaveClass(new RegExp(scheme))
  }

  for (const { mode, chip: chipName, total, present, absent } of MODES) {
    test(`filtr „${chipName}” zostawia tylko ten tryb, zapisuje mode w adresie, „Wszystkie” go zdejmuje`, async ({ page }) => {
      await gotoCatalog(page)
      await expect(chip(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'true')

      await chip(page, chipName).click()
      await expect(chip(page, chipName)).toHaveAttribute('aria-pressed', 'true')
      await expect(chip(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'false')
      await expect.poll(() => param(page, 'mode')).toBe(mode)
      // Aktywny tryb = jedyna sekcja jest otwarta (bez klikania), więc kafle widać od razu.
      await expect(lineLink(page, present)).toBeVisible()
      await expect(anyLineLinks(page)).toHaveCount(total)
      await expect(lineLink(page, absent)).toHaveCount(0)

      await chip(page, 'Wszystkie').click()
      await expect(chip(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => param(page, 'mode')).toBeNull()
      await expect(page.getByTestId('line-section')).toHaveCount(MODES.length)
    })
  }

  // Otwarcie linii z każdego trybu (autobus: zwykła i nocna), potem Wstecz: tryb i fraza wracają z adresu.
  const OPEN_AND_BACK = [
    { mode: 'metro', chip: 'Metro', line: 'M1', q: '' },
    { mode: 'tram', chip: 'Tramwaje', line: '20', q: '' },
    { mode: 'rail', chip: 'Kolej miejska', line: 'S2', q: 's2' },
    { mode: 'bus', chip: 'Autobusy', line: '128', q: '' },
    { mode: 'bus', chip: 'Autobusy', line: 'N16', q: 'n16' },
    { mode: 'bus', chip: 'Autobusy', line: 'L-1', q: 'l-1' },
  ] as const
  for (const { mode, chip: chipName, line, q } of OPEN_AND_BACK) {
    test(`linia ${line} (${mode}${q === '' ? '' : `, fraza „${q}”`}): Wstecz zachowuje tryb i frazę w adresie i w widoku`, async ({ page }) => {
      await gotoCatalog(page)
      await chip(page, chipName).click()
      // Stan trybu zatwierdza się w przejściu (`startTransition`) — fraza wpisana przed tym zatwierdzeniem widziałaby stary tryb.
      await expect(chip(page, chipName)).toHaveAttribute('aria-pressed', 'true')
      if (q !== '') {
        await searchbox(page).fill(q)
        await expect.poll(() => param(page, 'q')).toBe(q)
      }
      await expect.poll(() => param(page, 'mode')).toBe(mode)
      await lineLink(page, line).click()
      await expect(page).toHaveURL(new RegExp(`/city/warszawa/line/${line}`))

      await page.goBack()
      await expect(searchbox(page)).toBeVisible({ timeout: READY })
      await expect(chip(page, chipName)).toHaveAttribute('aria-pressed', 'true')
      await expect(searchbox(page)).toHaveValue(q)
      expect(param(page, 'mode')).toBe(mode)
      expect(param(page, 'q')).toBe(q === '' ? null : q)
      // Odwiedzona linia jest też w „Ostatnio oglądane”, więc link bywa podwójny — liczy się, że wynik jest.
      await expect(lineLink(page, line).first()).toBeVisible()
    })
  }

  test('fraza z adresu przeżywa odświeżenie i wraca do pola', async ({ page }) => {
    await gotoCatalog(page, '?q=n16')
    await expect(searchbox(page)).toHaveValue('n16')
    await expect(lineLink(page, 'N16')).toBeVisible()

    await page.reload()
    await expect(searchbox(page)).toHaveValue('n16', { timeout: READY })
    await expect(lineLink(page, 'N16')).toBeVisible()
    expect(param(page, 'q')).toBe('n16')
  })

  test('wpisywanie i filtr podmieniają adres (replace): brak nowych wpisów w historii', async ({ page }) => {
    await gotoCatalog(page)
    const before = await page.evaluate(() => window.history.length)

    await searchbox(page).pressSequentially('n16')
    await expect.poll(() => param(page, 'q')).toBe('n16')
    await chip(page, 'Autobusy').click()
    await expect.poll(() => param(page, 'mode')).toBe('bus')

    expect(await page.evaluate(() => window.history.length)).toBe(before)
  })

  test('inne parametry adresu zostają, a „Wyczyść wyszukiwanie” zdejmuje tylko q', async ({ page }) => {
    await gotoCatalog(page, '?foo=1')
    await searchbox(page).fill('n16')
    await chip(page, 'Autobusy').click()
    await expect.poll(() => param(page, 'mode')).toBe('bus')
    expect(param(page, 'foo')).toBe('1')
    expect(param(page, 'q')).toBe('n16')

    await page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click()
    await expect(searchbox(page)).toHaveValue('')
    await expect.poll(() => param(page, 'q')).toBeNull()
    expect(param(page, 'foo')).toBe('1')
    expect(param(page, 'mode')).toBe('bus')
  })

  test('błędny tryb w adresie jest po cichu ignorowany („Wszystkie”, wszystkie sekcje)', async ({ page }) => {
    await gotoCatalog(page, '?mode=zzz')
    await expect(page.getByTestId('line-section').first()).toBeVisible({ timeout: READY })
    await expect(chip(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('line-section')).toHaveCount(MODES.length)
    await expect(page.getByRole('heading', { level: 1, name: 'Linie', exact: true })).toBeVisible()
  })

  test('brak trafień: „Brak pasujących linii”, a „Wyczyść filtry” zdejmuje frazę i tryb', async ({ page }) => {
    await gotoCatalog(page, '?mode=bus')
    await searchbox(page).fill('zzzz')
    await expect(page.getByText('Brak pasujących linii')).toBeVisible()

    await page.getByRole('button', { name: 'Wyczyść filtry' }).click()
    await expect(searchbox(page)).toHaveValue('')
    await expect(chip(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => param(page, 'q')).toBeNull()
    expect(param(page, 'mode')).toBeNull()
    await expect(page.getByTestId('line-section')).toHaveCount(MODES.length)
  })

  test('320 px: chipy zawijają się, długie krańce zawijają się, strona nie przewija się w poziomie', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'pomiar clientWidth na desktop-chromium; mobile ma własny viewport')
    await page.setViewportSize({ width: 320, height: 700 })
    // Mock ma krótkie nazwy — pierwszej linii autobusowej podstawiamy kraniec bez spacji (najgorszy przypadek zawijania).
    const unbroken = 'Ulica'.repeat(14)
    await page.route('**/api/gtfs/lines*', async (route) => {
      const response = await route.fetch()
      const json = await response.json()
      json.lines.bus[0].longName = `${unbroken} – ${unbroken}`
      await route.fulfill({ response, json })
    })

    const overflow = () =>
      page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))

    for (const search of ['?mode=bus', '?q=ulica', '']) {
      await gotoCatalog(page, search)
      if (search === '') await expandAll(page)
      await expect(anyLineLinks(page).first()).toBeVisible({ timeout: READY })
      const { scrollWidth, clientWidth } = await overflow()
      expect(clientWidth).toBe(320)
      expect(scrollWidth, `przewijanie poziome dla „${search}”`).toBeLessThanOrEqual(clientWidth)
    }

    // Wszystkie chipy mieszczą się w szerokości (zawijanie zamiast suwaka).
    const rights = await page
      .getByRole('group', { name: 'Rodzaj komunikacji' })
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().right))
    expect(rights).toHaveLength(MODES.length + 1)
    for (const right of rights) expect(right).toBeLessThanOrEqual(320)
  })

  // Jeden widok = jeden test: sześć nawigacji + skanów axe w jednym teście przekraczało 30 s na mobile-safari.
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const search of A11Y_VIEWS) {
      test(`a11y: katalog „${search}” (m.in. nocna N16 i lokalna L-1) w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} bez naruszeń serious/critical`, async ({ page }) => {
        await page.addInitScript((value) => window.localStorage.setItem('theme', value), colorScheme)
        await gotoCatalog(page, search)
        await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme))
        await expect(anyLineLinks(page).first()).toBeVisible({ timeout: READY })
        if (search.includes('bus')) {
          await expect(lineLink(page, 'N16')).toBeVisible()
          await expect(lineLink(page, 'L-1')).toBeVisible()
        }
        await expectNoBlocking(page)
      })
    }
  }

  test('zmiana motywu zachowuje frazę i tryb i nie pobiera listy linii ponownie', async ({ page }) => {
    let listRequests = 0
    page.on('request', (request) => {
      if (request.url().includes('/api/gtfs/lines')) listRequests += 1
    })
    await gotoCatalog(page, '?mode=bus&q=dworzec')
    await expect(lineLink(page, 'N16')).toBeVisible()
    expect(listRequests).toBe(1)

    await switchTheme(page, 'dark')
    await switchTheme(page, 'light')

    await expect(searchbox(page)).toHaveValue('dworzec')
    await expect(chip(page, 'Autobusy')).toHaveAttribute('aria-pressed', 'true')
    expect(param(page, 'q')).toBe('dworzec')
    expect(param(page, 'mode')).toBe('bus')
    await expect(lineLink(page, 'N16')).toBeVisible()
    expect(listRequests).toBe(1)
  })

  test('zmiana motywu nie przywraca zwiniętej przez użytkownika sekcji', async ({ page }) => {
    await gotoCatalog(page, '?mode=metro')
    const metro = page.getByTestId('line-section')
    await expect(metro).toHaveJSProperty('open', true)
    await metro.locator('summary').click()
    await expect(metro).toHaveJSProperty('open', false)

    await switchTheme(page, 'dark')
    await expect(metro).toHaveJSProperty('open', false)
    await switchTheme(page, 'light')
    await expect(metro).toHaveJSProperty('open', false)
    await expect(chip(page, 'Metro')).toHaveAttribute('aria-pressed', 'true')
  })

  test('ograniczony ruch: chipy i sekcje działają od razu, bez czekania na animację', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoCatalog(page)

    for (const { mode, chip: chipName, present, total } of MODES) {
      await chip(page, chipName).click()
      await expect(chip(page, chipName)).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => param(page, 'mode')).toBe(mode)
      await expect(lineLink(page, present)).toBeVisible()
      await expect(anyLineLinks(page)).toHaveCount(total)
    }

    await chip(page, 'Wszystkie').click()
    await expect(page.getByTestId('line-section')).toHaveCount(MODES.length)
    const first = page.getByTestId('line-section').first()
    const wasOpen = await first.evaluate((node) => (node as HTMLDetailsElement).open)
    await first.locator('summary').click()
    await expect(first).toHaveJSProperty('open', !wasOpen)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// PR8 „09 Rozkład”: kategoria dnia w rozkładzie linii. Poniżej `lg` jedna kategoria naraz (chipy „Kategoria dnia”),
// od `lg` wszystkie kolumny obok siebie. Linia 20 ma w mocku dni robocze i soboty (bez niedziel), kierunek 0 startuje
// z „Centrum 01”; „Rondo ONZ” leży +6 min od startu. Kursy „wd” mocka jadą w DZISIEJSZEJ kategorii dnia (zależnej od dnia
// tygodnia), sobotnie (token SbS) zawsze w „Soboty” — testy opierają się na sobocie i nie zakładają kursów w „Dni robocze”.
// ---------------------------------------------------------------------------------------------------------------
test.describe('rozkład linii (PR8)', () => {
  const dayChips = (page: Page) => page.getByRole('group', { name: 'Kategoria dnia' })
  const dayColumn = (page: Page, name: string) => page.getByRole('group', { name, exact: true })

  async function openTimetableAt(page: Page, query: string) {
    await gotoLine(page, LINE_20, query)
    await openTimetable(page)
    // Aktywna kolumna jest zawsze widoczna (od `lg` wszystkie), także pusta.
    await expect(page.getByRole('group', { name: /^(Dni robocze|Soboty|Niedziele i święta)$/ }).first()).toBeVisible({ timeout: READY })
  }

  test('katalog → linia → przystanek → rozkład → sobota → wybór minuty → trasa z godzinami', async ({ page }) => {
    await gotoLines(page)
    await expandAll(page)
    await page.getByRole('link', { name: /^Linia 20: / }).click()
    await expect(page.getByRole('heading', { level: 1, name: LINE_20.longName })).toBeVisible({ timeout: READY })

    // Przystanek z listy trasy: na telefonie przełącza na Rozkład, na desktopie oba panele już stoją obok siebie.
    await routeList(page).getByRole('button', { name: /Rondo ONZ/ }).click()
    await expect(capsule(page)).toContainText('Rondo ONZ')

    if (lgUp(page)) {
      await expect(dayChips(page)).toBeHidden()
    } else {
      await dayChips(page).getByRole('button', { name: 'Soboty' }).click()
      await expect(dayChips(page).getByRole('button', { name: 'Soboty' })).toHaveAttribute('aria-pressed', 'true')
    }
    // Od `lg` klik w minutę innej kolumny sam przełącza dzień; poniżej `lg` aktywna jest już sobota.
    const saturday = dayColumn(page, 'Soboty')
    await saturday.getByRole('button', { name: '08:06, Soboty' }).click()
    await expect(page).toHaveURL(/[?&]day=saturday/)
    await expect(saturday.getByRole('button', { name: '08:06, Soboty' })).toHaveAttribute('aria-pressed', 'true')

    if (!lgUp(page)) {
      await paneButton(page, 'Trasa').click()
      await expect(paneButton(page, 'Trasa')).toHaveAttribute('aria-pressed', 'true')
    }
    // Wybrany kurs: lista trasy pokazuje godziny (08:00 → 08:06 → 08:12) zamiast przesunięć „+N min”.
    await expect(routeList(page)).toContainText('08:06')
    await expect(routeList(page)).toContainText('08:12')
    await expect(page).toHaveURL(/[?&]day=saturday/)
  })

  test('telefon: jedna kategoria naraz, desktop: wszystkie kolumny obok siebie', async ({ page }) => {
    await openTimetableAt(page, '')
    const columns = ['Dni robocze', 'Soboty', 'Niedziele i święta']
    if (lgUp(page)) {
      for (const name of columns) await expect(dayColumn(page, name)).toBeVisible()
      const boxes = await Promise.all(columns.map((name) => dayColumn(page, name).boundingBox()))
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x)
      expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x)
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2)
    } else {
      await expect(dayColumn(page, 'Dni robocze')).toBeVisible()
      await expect(dayColumn(page, 'Soboty')).toBeHidden()
      await dayChips(page).getByRole('button', { name: 'Niedziele i święta' }).click()
      await expect(dayColumn(page, 'Niedziele i święta')).toBeVisible()
      await expect(dayColumn(page, 'Dni robocze')).toBeHidden()
      await expect(dayChips(page).getByRole('button', { name: 'Dni robocze' })).toBeVisible()
    }
    // Kursy „wd” mocka jadą w dzisiejszej kategorii, więc każda kategoria ma albo minuty, albo „Brak kursów w tej
    // kategorii dnia” — nigdy pustą kolumnę (a sobota ma zawsze kursy z tokenu SbS).
    for (const name of columns) {
      if (!lgUp(page)) await dayChips(page).getByRole('button', { name }).click()
      const column = dayColumn(page, name)
      const own = (await column.getByRole('button').count()) + (await column.getByText('Brak kursów w tej kategorii dnia').count())
      expect(own, name).toBeGreaterThan(0)
    }
  })

  test('telefon: minuty i chipy dnia mają co najmniej 44 px', async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), 'cele dotyku dotyczą telefonu')
    await openTimetableAt(page, '?day=saturday')
    const size = async (target: ReturnType<Page['locator']>) => {
      const box = await target.boundingBox()
      return { w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0) }
    }
    for (const name of ['Dni robocze', 'Soboty', 'Niedziele i święta']) {
      expect((await size(dayChips(page).getByRole('button', { name }))).h).toBeGreaterThanOrEqual(44)
    }
    const minutes = dayColumn(page, 'Soboty').getByRole('button')
    expect(await minutes.count()).toBeGreaterThan(1)
    for (let i = 0; i < (await minutes.count()); i++) {
      const { w, h } = await size(minutes.nth(i))
      expect(w).toBeGreaterThanOrEqual(44)
      expect(h).toBeGreaterThanOrEqual(44)
    }
  })

  for (const width of [375, 320]) {
    test(`${width} px: rozkład w każdej kategorii nie przewija strony w poziomie, także przy tekście 200%`, async ({ page }, testInfo) => {
      test.skip(!isDesktop(testInfo), 'pomiar clientWidth na desktop-chromium; mobile ma własny viewport')
      await page.setViewportSize({ width, height: 812 })
      await openTimetableAt(page, '')
      const overflow = () =>
        page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
      for (const name of ['Dni robocze', 'Soboty', 'Niedziele i święta']) {
        await dayChips(page).getByRole('button', { name }).click()
        const { scrollWidth, clientWidth } = await overflow()
        expect(scrollWidth, name).toBeLessThanOrEqual(clientWidth)
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      await dayChips(page).getByRole('button', { name: 'Dni robocze' }).click()
      // Przy 200% tekstu strona jako całość może przewijać się przez przycisk „Zmień kierunek” z PR7 (poza tym ekranem);
      // rozkład (chipy dnia i kolumna) musi mieścić się w oknie.
      const timetableOverflow = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth + 1
        const scope = document.querySelector('[role="group"][aria-label="Kategoria dnia"]')?.parentElement
        return [...(scope?.querySelectorAll('*') ?? [])].filter((n) => n.getBoundingClientRect().right > limit).length
      })
      expect(timetableOverflow).toBe(0)
    })
  }

  test('klawiatura: minuta wybiera się i odznacza Enterem, a chip dnia Spacją; fokus zostaje na elemencie', async ({ page }) => {
    await openTimetableAt(page, '')
    if (!lgUp(page)) {
      const saturdayChip = dayChips(page).getByRole('button', { name: 'Soboty' })
      await saturdayChip.focus()
      await page.keyboard.press('Space')
      await expect(saturdayChip).toHaveAttribute('aria-pressed', 'true')
      await expect(saturdayChip).toBeFocused()
    }
    const minute = dayColumn(page, 'Soboty').getByRole('button').first()
    await minute.focus()
    await page.keyboard.press('Enter')
    await expect(minute).toHaveAttribute('aria-pressed', 'true')
    await expect(minute).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(minute).toHaveAttribute('aria-pressed', 'false')
  })

  test('?day=saturday otwiera sobotę, a zmiana dnia zostawia kierunek i przystanek', async ({ page }) => {
    await openTimetableAt(page, '?dir=1&stop=700201&day=saturday')
    if (!lgUp(page)) {
      await expect(dayChips(page).getByRole('button', { name: 'Soboty' })).toHaveAttribute('aria-pressed', 'true')
      await dayChips(page).getByRole('button', { name: 'Dni robocze' }).click()
      // Domyślna kategoria nie jest zapisywana w adresie.
      await expect(page).not.toHaveURL(/[?&]day=/)
    } else {
      // Od `lg` nie ma chipów: klik w minutę soboty zostawia `day=saturday` i nie rusza reszty adresu.
      await dayColumn(page, 'Soboty').getByRole('button').first().click()
      await expect(page).toHaveURL(/[?&]day=saturday/)
    }
    await expect(page).toHaveURL(/[?&]dir=1/)
    await expect(page).toHaveURL(/[?&]stop=700201/)
    await expect(capsule(page)).toContainText('Rondo ONZ')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    const mode = colorScheme === 'dark' ? 'ciemnym' : 'jasnym'

    test(`a11y: rozkład linii 20, sobota z wybraną minutą w trybie ${mode} bez naruszeń serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await openTimetableAt(page, '?stop=700201&day=saturday')
      await dayColumn(page, 'Soboty').getByRole('button', { name: '08:06, Soboty' }).click()
      await expect(dayColumn(page, 'Soboty').getByRole('button', { name: '08:06, Soboty' })).toHaveAttribute('aria-pressed', 'true')
      await expectNoBlockingViolations(page)
    })
  }
})
