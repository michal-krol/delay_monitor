import { expect, test, type Locator, type Page } from '@playwright/test'
import { scanA11y } from './axe'
import { SEARCH_FIELD } from './search'

// Wspólne dla specyfikacji mapy transportu (`map.spec.ts`, `gtfs-vehicles.spec.ts`, `a11y-map.spec.ts`).

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s) — strona sama ponawia.
export const READY = 45_000
export const CITY_MAP = '/city/warszawa/map'
export const MAP_NAME = 'Mapa transportu — Warszawa'

/** Telefon = poniżej `sm` (640 px): arkusz od dołu, czipy rodzajów; od `sm` panel obok mapy. */
export const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 640

export async function openMap(page: Page, path = CITY_MAP): Promise<Locator> {
  // mobile-chromium w CI (Pixel 7, DPR 2,625, programowy WebGL) rysuje prawdziwe kafelki ~5× wolniej niż lokalnie:
  // testy mapy transportu szły tam 15–30 s już na zielonym dev (PR #140: tryb linii 22 s, arkusz 29,6 s), więc
  // każdy dodatkowy krok przebijał domyślne 30 s — w połowie kliku, bez żadnego elementu zasłaniającego cel.
  test.slow(test.info().project.name === 'mobile-chromium', 'mapa transportu: kafelki w programowym WebGL przy DPR 2,625')
  await page.goto(path)
  const map = page.getByRole('region', { name: MAP_NAME })
  await expect(map).toBeVisible({ timeout: READY })
  return map
}

/** Jedno wspólne pole (PR10): stacje, przystanki i linie — wyniki w panelu `role=group` nad mapą. */
export const mapSearch = (page: Page): Locator => page.getByRole('searchbox', { name: SEARCH_FIELD })
export const searchResults = (page: Page): Locator => page.getByRole('group', { name: 'Wyniki wyszukiwania' })

// Nazwy wierszy wyników (jak w unified-search.spec.ts): „{nazwa}, {rodzaj} · {miasto}".
export const RAIL_ROW = /^Warszawa Centralna, Stacja kolejowa PKP/
export const STOP_ROW = /^Centrum, Zespół przystanków · Warszawa/
export const lineRow = (line: string): RegExp => new RegExp(`^Linia ${line}, `)

/** Wpisuje frazę i wybiera wiersz wyniku; wybór czyści pole i zostaje na mapie. */
export async function pickResult(page: Page, query: string, row: RegExp): Promise<void> {
  await mapSearch(page).fill(query)
  await searchResults(page).getByRole('button', { name: row }).first().click({ timeout: READY })
}

/** Lista obiektów w kadrze: na telefonie rozwinięty przegląd (region), od `sm` okno „W widoku". */
export const visibleList = (page: Page): Locator =>
  isPhone(page) ? page.getByRole('region', { name: 'Pojazdy i przystanki w widoku' }) : page.getByRole('dialog', { name: 'W widoku' })

/** „Lista" przełącza (nie otwiera): po zamknięciu karty lista zostaje otwarta — wtedy wystarczy `visibleList`. */
export async function openVisibleList(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  const list = visibleList(page)
  await expect(list).toBeVisible()
  return list
}

/**
 * Podmienia `navigator.geolocation` na licznik wywołań (`getCurrentPosition` i `watchPosition`). `deny` odrzuca z
 * PERMISSION_DENIED; `delegate` przekazuje dalej do prawdziwego API (z uprawnieniem i pozycją z kontekstu Playwrighta).
 * Instalowany PRZED `goto`, więc liczy też wywołania z samego ładowania strony.
 */
export async function stubGeolocation(page: Page, mode: 'deny' | 'delegate'): Promise<void> {
  await page.addInitScript((stubMode) => {
    const counter = { calls: 0 }
    ;(window as unknown as { __geo: typeof counter }).__geo = counter
    const real = navigator.geolocation
    const denied = { code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback, failure?: PositionErrorCallback, options?: PositionOptions) => {
          counter.calls++
          if (stubMode === 'deny') failure?.(denied as GeolocationPositionError)
          else real.getCurrentPosition(success, failure, options)
        },
        watchPosition: (success: PositionCallback, failure?: PositionErrorCallback, options?: PositionOptions) => {
          counter.calls++
          return real.watchPosition(success, failure, options)
        },
        clearWatch: (id: number) => real.clearWatch(id),
      },
    })
  }, mode)
}

export const geolocationCalls = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __geo: { calls: number } }).__geo.calls)

export async function expectNoBlockingA11y(page: Page): Promise<void> {
  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help} ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
}
