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

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`a11y: katalog z aktywnym chipem i wyniki szukania (m.in. nocna N16 i lokalna L-1) w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} bez naruszeń serious/critical`, async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem('theme', value), colorScheme)
      for (const search of A11Y_VIEWS) {
        await gotoCatalog(page, search)
        await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme))
        await expect(anyLineLinks(page).first()).toBeVisible({ timeout: READY })
        if (search.includes('bus')) {
          await expect(lineLink(page, 'N16')).toBeVisible()
          await expect(lineLink(page, 'L-1')).toBeVisible()
        }
        await expectNoBlocking(page)
      }
    })
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
