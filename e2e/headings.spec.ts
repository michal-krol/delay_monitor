import { test, expect } from '@playwright/test'

// Jeden h1 na stronę (AGENTS.md #16, C7) + jeden górny rząd na stronach
// szczegółowych: ← „Wróć do …” + ścieżka, bez poziomego przewijania (375 px).

// Ta sama formuła co w `map.spec.ts` — mock rebase'uje operatingDate do dziś.
function warsawToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
}

const PAGES: { name: string; path: string; pinnedItems?: unknown[] }[] = [
  { name: 'pulpit (pusty)', path: '/' },
  {
    name: 'pulpit z przypiętą stacją',
    path: '/',
    pinnedItems: [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }],
  },
  { name: 'stacja', path: '/station/33605?name=Warszawa%20Centralna' },
  { name: 'ekran miasta', path: '/city/warszawa' },
  { name: 'ekran miasta z przystankiem', path: '/city/warszawa?stop=1001&name=Centrum' },
  { name: 'linie', path: '/city/warszawa/lines' },
  { name: 'linia', path: '/city/warszawa/line/20' },
  { name: 'przystanek', path: '/city/warszawa/stop/100101' },
  { name: 'połączenie', path: `/connection/2026/104/${warsawToday()}` },
  { name: 'mapa', path: '/city/warszawa/map' },
]

for (const { name, path, pinnedItems } of PAGES) {
  test(`jeden h1: ${name}`, async ({ page }) => {
    if (pinnedItems !== undefined) {
      await page.addInitScript((value) => window.localStorage.setItem('monitor.favourites.v2', JSON.stringify(value)), pinnedItems)
    }
    await page.goto(path)
    // GTFS mock parsuje się raz przy starcie (~kilkanaście s); `toHaveCount` ponawia.
    await expect(page.locator('h1')).toHaveCount(1, { timeout: 45_000 })
  })
}

const DETAIL_PAGES = [
  { name: 'stacja', path: '/station/33605?name=Warszawa%20Centralna%20z%20bardzo%20d%C5%82ug%C4%85%20nazw%C4%85%20testow%C4%85', back: 'Wróć do Pulpitu' },
  { name: 'przystanek', path: '/city/warszawa/stop/100101', back: 'Wróć do odjazdów' },
  { name: 'linia', path: '/city/warszawa/line/20', back: 'Wróć do linii' },
  { name: 'połączenie', path: `/connection/2026/104/${warsawToday()}`, back: 'Wróć do tablicy' },
]

for (const { name, path, back } of DETAIL_PAGES) {
  test(`jeden górny rząd: ${name}`, async ({ page }, testInfo) => {
    await page.goto(path)
    // Stacja na telefonie: ← nazwa ★ ⋮ w karcie (nazwa raz), pasek ze ścieżką jest schowany.
    if (name === 'stacja' && testInfo.project.name !== 'desktop-chromium') {
      await expect(page.getByRole('link', { name: back, exact: true })).toBeVisible({ timeout: 45_000 })
      await expect(page.getByRole('navigation', { name: 'Ścieżka nawigacji' })).toHaveCount(0)
      const overflowPhone = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflowPhone).toBeLessThanOrEqual(0)
      return
    }
    const nav = page.getByRole('navigation', { name: 'Ścieżka nawigacji' })
    await expect(nav).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('navigation', { name: 'Ścieżka nawigacji' })).toHaveCount(1)
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    // ← i ścieżka w tym samym rzędzie co motyw (desktop). Poniżej `sm` motyw jest w `MobileHeader` —
    // jeden na ekran, nad wierszem „wstecz".
    const backControl = page.getByRole(name === 'połączenie' ? 'button' : 'link', { name: back, exact: true })
    await expect(backControl).toBeVisible()
    const theme = page.getByRole('button', { name: /Przełącz na tryb/ })
    await expect(theme).toHaveCount(1)
    const [backBox, themeBox] = await Promise.all([backControl.boundingBox(), theme.boundingBox()])
    if (testInfo.project.name === 'desktop-chromium') {
      expect(Math.abs(backBox!.y + backBox!.height / 2 - (themeBox!.y + themeBox!.height / 2))).toBeLessThan(2)
    } else {
      expect(backBox!.y).toBeGreaterThanOrEqual(themeBox!.y + themeBox!.height)
    }
    // Poziome przewijanie strony = przepełnienie (375 px, długie nazwy).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

// Komunikat „Nie udało się skopiować — link w pasku adresu” nie może poszerzyć
// wiersza (375 px): wymuszamy porażkę schowka i brak natywnego arkusza.
const SHARE_PAGES = [
  // Stacja na telefonie: „Udostępnij” jest w menu „Więcej” górnego rzędu karty.
  { name: 'stacja', path: '/station/33605?name=Warszawa%20Centralna', menu: true },
  { name: 'ekran miasta z przystankiem', path: '/city/warszawa?stop=1001&name=Centrum', menu: false },
]

for (const { name, path, menu } of SHARE_PAGES) {
  test(`porażka kopiowania linku nie przepełnia strony: ${name}`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('blocked')) },
        configurable: true,
      })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(path)
    // Sama strona (nie wąski viewport) nie może się przewijać poziomo — przed i po kliknięciu.
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (menu) await page.getByRole('button', { name: 'Więcej' }).click({ timeout: 45_000 })
    await expect(page.getByRole('button', { name: 'Udostępnij', exact: true })).toBeVisible({ timeout: 45_000 })
    expect(await overflow()).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Udostępnij', exact: true }).click()
    // Są dwa regiony `status` (komunikat udostępniania i pusty region baneru offline) — zawężamy do komunikatu udostępniania.
    const status = page.getByRole('status').filter({ hasText: 'link w pasku adresu' })
    await expect(status).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
    // Sam komunikat i przełącznik motywu mieszczą się w oknie (dokument mógłby ukrywać przepełnienie).
    for (const box of await Promise.all([status.boundingBox(), page.getByRole('button', { name: /Przełącz na tryb/ }).boundingBox()])) {
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    }
  })
}

// Grupa akcji w nagłówku (Udostępnij + wybór miasta + motyw) ma się zawinąć, a nie wystawać:
// w CI (WebKit na Linuksie, szerszy font) przy 375 px wystawała o 1 px; przy 320 px widać to wszędzie.
test('akcje nagłówka zawijają się zamiast przepełniać stronę (320 px)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 })
  await page.goto('/city/warszawa?stop=1001&name=Centrum')
  await expect(page.getByRole('button', { name: 'Udostępnij', exact: true })).toBeVisible({ timeout: 45_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})
