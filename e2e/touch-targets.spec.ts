import { test, expect, type Locator } from '@playwright/test'
import { scrollToStopMap, showLineTimetable } from './helpers/info'

// Niewidoczny obszar trafienia 44×44 (`touch-44`, WCAG 2.5.5) — wygląd bez zmian,
// więc mierzymy `::after`, nie sam przycisk. Decyzja właściciela 2026-09-29.
const READY = 45_000

async function afterSize(el: Locator) {
  return el.evaluate((node) => {
    const s = getComputedStyle(node, '::after')
    return { w: parseFloat(s.width), h: parseFloat(s.height) }
  })
}

test('IconButton (przypnij na tablicy stacji) ma obszar trafienia >= 44×44; wygląd 36 px, na telefonie 44 (siatka kontrolek karty)', async ({ page }, testInfo) => {
  await page.goto('/station/33605?name=Warszawa%20Centralna')
  const pin = page.getByRole('button', { name: 'Przypnij do Startu' })
  await expect(pin).toBeVisible()
  const { w, h } = await afterSize(pin)
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
  const box = await pin.boundingBox()
  expect(box?.width).toBe(testInfo.project.name === 'desktop-chromium' ? 36 : 44)
})

test('cele dolnego paska (mobile: Start, Mapa, Szukaj, Linie) mają pole >= 44×44', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'dolny pasek tylko poniżej sm')
  await page.goto('/')
  // Linki i przycisk „Szukaj" — pierwsze dziecko każdego <li> paska.
  const targets = page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('listitem').locator('> *')
  await expect(targets).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    const box = await targets.nth(i).boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

test('„Powiększ mapę" zostaje w rogu mapy i ma obszar trafienia >= 44×44', async ({ page }) => {
  await page.goto('/city/warszawa/stop/1001')
  // Telefon: mapa podglądowa stoi pod odjazdami (PR6) i montuje się po przewinięciu; od `sm` w prawej kolumnie.
  await scrollToStopMap(page)
  await expect(page.getByRole('region', { name: /^Mapa (zespołu przystanków|przystanku)/ })).toBeVisible({ timeout: READY })
  const btn = page.getByRole('button', { name: 'Powiększ mapę' })
  const { w, h } = await afterSize(btn)
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
  expect(await btn.evaluate((n) => getComputedStyle(n).position)).toBe('absolute')
})

test('minuty w rozkładzie linii mają >= 24×24 px (WCAG 2.5.8)', async ({ page }) => {
  // Telefon pokazuje jedną kategorię dnia; sobotnie kursy mają stabilną kategorię niezależnie od dzisiejszej daty.
  await page.goto('/city/warszawa/line/20?day=saturday')
  await showLineTimetable(page)
  const minute = page.getByRole('link', { name: /^\d{2}:\d{2}, Sobota, dzień kursowania/ }).first()
  await expect(minute).toBeVisible({ timeout: READY })
  const box = await minute.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(24)
  expect(box?.height).toBeGreaterThanOrEqual(24)
})

test('link „Wróć do Startu” w TopBarze ma obszar trafienia >= 44×44', async ({ page }) => {
  await page.goto('/station/33605?name=Warszawa%20Centralna')
  const { w, h } = await afterSize(page.getByRole('link', { name: 'Wróć do Startu' }))
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
})

test('przełącznik paska bocznego (desktop) ma obszar trafienia >= 44×44', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'pasek boczny tylko od sm')
  await page.goto('/')
  const { w, h } = await afterSize(page.getByRole('button', { name: /pasek boczny/ }))
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
})

// PR5: pozostałe cele dotyku na telefonie. „Cel” = większy z rozmiarów pola przycisku
// i niewidocznego `::after` (`touch-44`) — obie drogi spełniają WCAG 2.5.5.
async function hitHeight(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const after = parseFloat(getComputedStyle(node, '::after').height)
    return Math.max(node.getBoundingClientRect().height, Number.isNaN(after) ? 0 : after)
  })
}

test.describe('PR5: cele dotyku na telefonie', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop-chromium', 'cele dotyku dotyczą telefonu (poniżej sm)')
  })

  test('mapa: wyszukiwanie, utrudnienia i lokalizacja mają >=44px', async ({ page }) => {
    await page.goto('/city/warszawa/map')
    for (const name of ['Szukaj', 'Z utrudnieniami', 'Moja lokalizacja']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible({ timeout: READY })
      expect(Math.round(await hitHeight(button))).toBeGreaterThanOrEqual(44)
    }
  })

  test('strona linii: pigułka kierunku i przystanek na osi mają >= 44 px', async ({ page }) => {
    await page.goto('/city/warszawa/line/20')
    await expect(page.getByRole('heading', { name: /^Trasa linii/ })).toBeAttached({ timeout: READY })
    expect(await hitHeight(page.getByRole('button', { name: 'Zmień kierunek' }))).toBeGreaterThanOrEqual(44)
    const stop = page.getByRole('list').getByRole('button', { pressed: false }).first()
    await expect(stop).toBeVisible({ timeout: READY })
    expect(await hitHeight(stop)).toBeGreaterThanOrEqual(44)
  })

  test('/search: pole i „Wyczyść" mają >= 44 px, wiersze wyników >= 52 px', async ({ page }) => {
    await page.goto('/search?q=Centr')
    await page.waitForLoadState('networkidle')
    const main = page.getByRole('main')
    const row = main.getByRole('button', { name: /^Warszawa Centralna, Stacja kolejowa PKP/ })
    await expect(row).toBeVisible({ timeout: READY })
    expect(Math.round(await hitHeight(main.getByRole('searchbox', { name: 'Stacja, przystanek, linia lub pociąg' })))).toBeGreaterThanOrEqual(44)
    expect(Math.round(await hitHeight(main.getByRole('button', { name: 'Wyczyść' })))).toBeGreaterThanOrEqual(44)
    const rows = main.locator('section').getByRole('button')
    await expect(rows.first()).toBeVisible()
    for (let i = 0; i < (await rows.count()); i++) expect(Math.round(await hitHeight(rows.nth(i)))).toBeGreaterThanOrEqual(52)
  })

  test('„Wróć do wyszukiwania” ma >= 44 px', async ({ page }) => {
    await page.goto('/city/warszawa?station=33605&name=Warszawa%20Centralna')
    const back = page.getByRole('button', { name: 'Wróć do wyszukiwania' })
    await expect(back).toBeVisible({ timeout: READY })
    expect(await hitHeight(back)).toBeGreaterThanOrEqual(44)
  })
})

test('pola input i select mają font >= 16 px na telefonie', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'iOS zoomuje pole tylko na telefonie')
  const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea'
  for (const path of ['/', '/city/warszawa', '/city/warszawa/lines', '/city/warszawa/map', '/search']) {
    await page.goto(path)
    // Pulpit nie ma już pola w treści — pole „Dodaj" żyje w oknie wyszukiwania.
    if (path === '/') await page.getByRole('button', { name: 'Dodaj' }).click()
    await expect(page.locator(FIELDS).first()).toBeAttached({ timeout: READY })
    const small = await page.locator(FIELDS).evaluateAll((nodes) =>
      nodes.map((n) => ({ n: (n as HTMLElement).getAttribute('aria-label') ?? n.tagName, px: parseFloat(getComputedStyle(n).fontSize) })).filter((f) => f.px < 16),
    )
    expect(small, `${path}: pola poniżej 16 px`).toEqual([])
  }
})
