import { test, expect, type Locator } from '@playwright/test'
import { showBoardMap, showLineTimetable } from './helpers/info'

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
  const pin = page.getByRole('button', { name: 'Przypnij do Pulpitu' })
  await expect(pin).toBeVisible()
  const { w, h } = await afterSize(pin)
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
  const box = await pin.boundingBox()
  expect(box?.width).toBe(testInfo.project.name === 'desktop-chromium' ? 36 : 44)
})

test('„Szukaj" w nagłówku (mobile) ma obszar trafienia >= 44×44', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'nagłówek tylko poniżej sm')
  await page.goto('/')
  const { w, h } = await afterSize(page.getByRole('button', { name: 'Szukaj' }))
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
})

test('zakładki dolnego paska (mobile) mają pole >= 44×44', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'dolny pasek tylko poniżej sm')
  await page.goto('/')
  const links = page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('link')
  await expect(links).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    const box = await links.nth(i).boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

test('„Powiększ mapę" zostaje w rogu mapy i ma obszar trafienia >= 44×44', async ({ page }) => {
  await page.goto('/city/warszawa/stop/1001')
  await showBoardMap(page) // telefon: zwinięta sekcja „Mapa” w arkuszu „Info” (PR5)
  await expect(page.getByRole('region', { name: /^Mapa (zespołu przystanków|przystanku)/ })).toBeVisible({ timeout: READY })
  const btn = page.getByRole('button', { name: 'Powiększ mapę' })
  const { w, h } = await afterSize(btn)
  expect(w).toBeGreaterThanOrEqual(44)
  expect(h).toBeGreaterThanOrEqual(44)
  expect(await btn.evaluate((n) => getComputedStyle(n).position)).toBe('absolute')
})

test('minuty w rozkładzie linii mają >= 24×24 px (WCAG 2.5.8)', async ({ page }) => {
  await page.goto('/city/warszawa/line/20')
  await showLineTimetable(page)
  const minute = page.getByRole('button', { pressed: false }).filter({ hasText: /^\d\d~?$/ }).first()
  await expect(minute).toBeVisible({ timeout: READY })
  const box = await minute.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(24)
  expect(box?.height).toBeGreaterThanOrEqual(24)
})

test('link „Wróć do Pulpitu” w TopBarze ma obszar trafienia >= 44×44', async ({ page }) => {
  await page.goto('/station/33605?name=Warszawa%20Centralna')
  const { w, h } = await afterSize(page.getByRole('link', { name: 'Wróć do Pulpitu' }))
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

  test('MapFilters: wiersze warstw i „Pokaż wszystko” mają >= 44 px', async ({ page }) => {
    await page.goto('/city/warszawa/map')
    await page.getByRole('button', { name: /Filtry/ }).click()
    const rows = page.getByRole('checkbox').locator('xpath=ancestor::label[1]')
    await expect(rows.first()).toBeVisible({ timeout: READY })
    // Math.round: 44 px rows measured mid-layout come out as 43.99998 (subpixel noise, seen 2026-10-07/08).
    for (let i = 0; i < (await rows.count()); i++) expect(Math.round(await hitHeight(rows.nth(i)))).toBeGreaterThanOrEqual(44)
    expect(Math.round(await hitHeight(page.getByRole('button', { name: 'Pokaż wszystko' })))).toBeGreaterThanOrEqual(44)
  })

  test('strona linii: pigułka kierunku i przystanek na osi mają >= 44 px', async ({ page }) => {
    await page.goto('/city/warszawa/line/20')
    await expect(page.getByRole('heading', { name: /^Trasa linii/ })).toBeAttached({ timeout: READY })
    expect(await hitHeight(page.getByRole('button', { name: /zmień kierunek/ }))).toBeGreaterThanOrEqual(44)
    const stop = page.getByRole('list').getByRole('button', { pressed: false }).first()
    await expect(stop).toBeVisible({ timeout: READY })
    expect(await hitHeight(stop)).toBeGreaterThanOrEqual(44)
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
  for (const path of ['/', '/city/warszawa', '/city/warszawa/lines', '/city/warszawa/map']) {
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
