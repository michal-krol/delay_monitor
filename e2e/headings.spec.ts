import { test, expect } from '@playwright/test'

// Jeden h1 na stronę (AGENTS.md #16, C7) + jeden górny rząd na stronach
// szczegółowych: ← „Wróć do …” + ścieżka, bez poziomego przewijania (375 px).

// Ta sama formuła co w `map.spec.ts` — mock rebase'uje operatingDate do dziś.
function warsawToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
}

const PAGES: { name: string; path: string; favourites?: unknown[] }[] = [
  { name: 'pulpit (pusty)', path: '/' },
  {
    name: 'pulpit z przypiętą stacją',
    path: '/',
    favourites: [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }],
  },
  { name: 'stacja', path: '/station/33605?name=Warszawa%20Centralna' },
  { name: 'ekran miasta', path: '/city/warszawa' },
  { name: 'ekran miasta z przystankiem', path: '/city/warszawa?stop=1001&name=Centrum' },
  { name: 'trasy', path: '/city/warszawa/lines' },
  { name: 'linia', path: '/city/warszawa/line/20' },
  { name: 'przystanek', path: '/city/warszawa/stop/100101' },
  { name: 'połączenie', path: `/connection/2026/104/${warsawToday()}` },
  { name: 'mapa', path: '/city/warszawa/map' },
]

for (const { name, path, favourites } of PAGES) {
  test(`jeden h1: ${name}`, async ({ page }) => {
    if (favourites !== undefined) {
      await page.addInitScript((value) => window.localStorage.setItem('monitor.favourites.v2', JSON.stringify(value)), favourites)
    }
    await page.goto(path)
    // GTFS mock parsuje się raz przy starcie (~kilkanaście s); `toHaveCount` ponawia.
    await expect(page.locator('h1')).toHaveCount(1, { timeout: 45_000 })
  })
}

const DETAIL_PAGES = [
  { name: 'stacja', path: '/station/33605?name=Warszawa%20Centralna%20z%20bardzo%20d%C5%82ug%C4%85%20nazw%C4%85%20testow%C4%85', back: 'Wróć do Pulpitu' },
  { name: 'przystanek', path: '/city/warszawa/stop/100101', back: 'Wróć do odjazdów' },
  { name: 'linia', path: '/city/warszawa/line/20', back: 'Wróć do tras' },
  { name: 'połączenie', path: `/connection/2026/104/${warsawToday()}`, back: 'Wróć do tablicy' },
]

for (const { name, path, back } of DETAIL_PAGES) {
  test(`jeden górny rząd: ${name}`, async ({ page }) => {
    await page.goto(path)
    const nav = page.getByRole('navigation', { name: 'Ścieżka nawigacji' })
    await expect(nav).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('navigation', { name: 'Ścieżka nawigacji' })).toHaveCount(1)
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    // ← i ścieżka w tym samym rzędzie co „Udostępnij”/motyw, nie w osobnym.
    const backControl = page.getByRole(name === 'połączenie' ? 'button' : 'link', { name: back, exact: true })
    await expect(backControl).toBeVisible()
    const [backBox, themeBox] = await Promise.all([
      backControl.boundingBox(),
      page.getByRole('button', { name: /Przełącz na tryb/ }).boundingBox(),
    ])
    expect(Math.abs(backBox!.y + backBox!.height / 2 - (themeBox!.y + themeBox!.height / 2))).toBeLessThan(2)
    // Poziome przewijanie strony = przepełnienie (375 px, długie nazwy).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

// Komunikat „Nie udało się skopiować — link w pasku adresu” nie może poszerzyć
// wiersza (375 px): wymuszamy porażkę schowka i brak natywnego arkusza.
const SHARE_PAGES = [
  { name: 'stacja', path: '/station/33605?name=Warszawa%20Centralna' },
  { name: 'ekran miasta z przystankiem', path: '/city/warszawa?stop=1001&name=Centrum' },
]

for (const { name, path } of SHARE_PAGES) {
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
    await expect(page.getByRole('button', { name: 'Udostępnij', exact: true })).toBeVisible({ timeout: 45_000 })
    expect(await overflow()).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Udostępnij', exact: true }).click()
    const status = page.getByRole('status')
    await expect(status).toContainText('link w pasku adresu')
    expect(await overflow()).toBeLessThanOrEqual(0)
    // Sam komunikat i przełącznik motywu mieszczą się w oknie (dokument mógłby ukrywać przepełnienie).
    for (const box of await Promise.all([status.boundingBox(), page.getByRole('button', { name: /Przełącz na tryb/ }).boundingBox()])) {
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    }
  })
}
