import { changeTheme } from './helpers/page-options'
import type { Page } from '@playwright/test'
import { test, expect } from './helpers/test'
import { CITY_MAP, RAIL_ROW, READY, STOP_ROW, expectNoBlockingA11y, isPhone, lineRow, mapSearch, openMap, openVisibleList, pickResult, searchResults, stubGeolocation } from './helpers/map'

// PR10 (Task 7): axe na stanach mapy transportu w obu motywach + reduced motion + forced colors.
// Telefon (arkusz) i szeroki układ wynikają z projektu Playwrighta; bramka jak w `a11y.spec.ts` (serious/critical, WCAG 2 A/AA).
const states: { name: string; run: (page: Page) => Promise<void> }[] = [
  {
    name: 'przegląd',
    run: async (page) => {
      await openMap(page)
      if (isPhone(page)) await expect(page.getByRole('region', { name: 'Pojazdy i przystanki w widoku' }).getByText(/Pozycje sprzed /)).toBeVisible({ timeout: READY })
      else await expect(page.getByText('Legenda', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'przegląd rozwinięty („Lista")',
    run: async (page) => {
      await openMap(page)
      const list = await openVisibleList(page)
      await expect(list.getByRole('button', { name: /^Linia 20/ }).first()).toBeVisible({ timeout: READY })
    },
  },
  {
    name: 'karta przystanku',
    run: async (page) => {
      await openMap(page)
      await pickResult(page, 'Centrum', STOP_ROW)
      await expect(page.getByRole('dialog', { name: 'Centrum' }).getByRole('heading', { name: 'Najbliższe odjazdy · rozkład' })).toBeVisible()
    },
  },
  {
    name: 'okolica',
    run: async (page) => {
      await openMap(page)
      await pickResult(page, 'Centrum', STOP_ROW)
      await page.getByRole('dialog', { name: 'Centrum' }).getByRole('button', { name: 'Co jest w pobliżu?' }).click()
      await expect(page.getByRole('dialog', { name: 'W pobliżu' })).toBeVisible()
    },
  },
  {
    name: 'panel linii z komunikatami',
    run: async (page) => {
      await openMap(page)
      await pickResult(page, '20', lineRow('20'))
      const panel = page.getByRole('dialog', { name: 'Linia 20' })
      await expect(panel.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
    },
  },
  {
    name: 'wyniki wyszukiwania i aktywne filtry',
    run: async (page) => {
      await openMap(page, `${CITY_MAP}?hide=trams`)
      await expect(page.getByRole('list', { name: 'Aktywne filtry' }).getByText('Ukryte: tramwaje')).toBeVisible({ timeout: READY })
      await mapSearch(page).fill('Cen')
      await expect(searchResults(page).getByRole('button', { name: RAIL_ROW })).toBeVisible({ timeout: READY })
    },
  },
  {
    name: 'panel „Filtry"',
    run: async (page) => {
      await openMap(page)
      await page.getByRole('button', { name: /^Filtry/ }).click()
      await expect(page.getByRole('button', { name: 'Pokaż wszystko' })).toBeVisible()
    },
  },
  {
    name: 'odmowa lokalizacji',
    run: async (page) => {
      await stubGeolocation(page, 'deny')
      await openMap(page)
      await page.getByRole('button', { name: 'Moja lokalizacja' }).click()
      await expect(page.getByText('Brak dostępu do lokalizacji. Wyszukaj miejsce lub wybierz je na mapie')).toBeVisible()
    },
  },
  {
    name: '?nearby=1 bez pozycji',
    run: async (page) => {
      await openMap(page, `${CITY_MAP}?nearby=1`)
      await expect(page.getByRole('button', { name: 'Pokaż moją lokalizację' })).toBeVisible({ timeout: READY })
    },
  },
]

for (const theme of ['light', 'dark'] as const) {
  for (const state of states) {
    test(`a11y: mapa transportu — ${state.name} (${theme}) bez naruszeń serious/critical`, async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
      await state.run(page)
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      await expectNoBlockingA11y(page)
    })
  }
}

/** Wynik bez pozycji na mapie: serwer wyszukiwania jest w mocku pełny, więc zdejmujemy współrzędne ze stacji kolejowych. */
async function stripRailCoordinates(page: Page): Promise<void> {
  await page.route('**/api/search**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const station of body.stations ?? []) {
      if (station.kind !== 'rail') continue
      delete station.lat
      delete station.lon
    }
    await route.fulfill({ response, json: body })
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`a11y: mapa transportu — komunikat „Brak pozycji na mapie" (${theme}) bez naruszeń serious/critical`, async ({ page }) => {
    await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
    await stripRailCoordinates(page)
    await openMap(page)
    await pickResult(page, 'Centralna', RAIL_ROW)
    await expect(page.getByRole('status').filter({ hasText: 'Brak pozycji na mapie: Warszawa Centralna.' })).toBeVisible()
    await expectNoBlockingA11y(page)
  })
}

test.describe('ruch ograniczony (prefers-reduced-motion)', () => {
  test.use({ reducedMotion: 'reduce' })

  test('mapa transportu: panel „Filtry" wchodzi bez przejścia, arkusz na telefonie przewija się bez animacji; po zmianie preferencji wraca ruch', async ({ page }) => {
    await openMap(page)
    await page.getByRole('button', { name: /^Filtry/ }).click()
    const panel = page.locator('[id]', { has: page.getByRole('button', { name: 'Pokaż wszystko' }) }).last()
    const transitionMs = () => panel.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) * 1000)
    const sheetScroll = () => page.locator('.bottom-sheet').evaluate((el) => getComputedStyle(el).scrollBehavior)
    await expect(panel).toBeVisible()
    expect(await transitionMs()).toBe(0)
    if (isPhone(page)) expect(await sheetScroll()).toBe('auto')

    // Preferencja działa na żywo, bez przeładowania (jak w motion.spec.ts): bez `reduce` panel i arkusz znów się animują.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect.poll(transitionMs).toBeGreaterThan(0)
    if (isPhone(page)) await expect.poll(sheetScroll).toBe('smooth')
  })

  test('mapa transportu: wybór obiektu i zmiana motywu nie startują przejścia widoku', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'View Transitions tylko w Chromium')
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: number }
      w.__vt = 0
      const original = document.startViewTransition?.bind(document)
      if (original !== undefined) document.startViewTransition = ((arg?: unknown) => ((w.__vt += 1), original(arg as never))) as typeof document.startViewTransition
    })
    await openMap(page)
    await pickResult(page, 'Centrum', STOP_ROW)
    await expect(page.getByRole('dialog', { name: 'Centrum' })).toBeVisible()
    await changeTheme(page, 'Przełącz na tryb ciemny')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(0)
  })
})

// Tryb wysokiego kontrastu zastępuje tła kolorami systemowymi: stan „wciśnięty" i fokus muszą mieć własny obrys (`globals.css`, `ui-motion.md`).
test.describe('tryb wysokiego kontrastu (forced-colors)', () => {
  test.use({ colorScheme: 'light' })

  const outline = (locator: ReturnType<Page['locator']>) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el)
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
    })

  test('mapa transportu: aktywny czip rodzaju i „Lista" mają obrys, a komunikat „Brak pozycji" widoczny pierścień fokusu', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await stripRailCoordinates(page)
    await openMap(page)

    const list = page.getByRole('button', { name: 'Lista', exact: true })
    await list.click()
    await expect(list).toHaveAttribute('aria-pressed', 'true')
    expect(await outline(list), 'aktywna „Lista" bez obrysu').toMatchObject({ style: 'solid' })
    expect((await outline(list)).width).toBeGreaterThanOrEqual(2)
    await list.click() // zamyka listę — dalej oglądamy przegląd

    if (isPhone(page)) {
      const chip = page.getByRole('group', { name: 'Rodzaje pojazdów' }).getByRole('button', { name: 'Tramwaje' })
      await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: READY })
      expect(await outline(chip), 'aktywny czip bez obrysu').toMatchObject({ style: 'solid' })
      expect((await outline(chip)).width).toBeGreaterThanOrEqual(2)
    }

    // Wybór z klawiatury: fokus na komunikacie jest wtedy „focus-visible" (po kliknięciu myszą przeglądarka go nie rysuje).
    await mapSearch(page).fill('Centralna')
    await searchResults(page).getByRole('button', { name: RAIL_ROW }).first().focus({ timeout: READY })
    await page.keyboard.press('Enter')
    const notice = page.getByRole('status').filter({ hasText: 'Brak pozycji na mapie: Warszawa Centralna.' })
    await expect(notice).toBeFocused()
    expect(await outline(notice), 'komunikat bez pierścienia fokusu').toMatchObject({ style: 'solid' })
    expect((await outline(notice)).width).toBeGreaterThanOrEqual(2)
    await expectNoBlockingA11y(page)
  })
})
