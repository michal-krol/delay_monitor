import { test, expect, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'

// PR5: axe na każdej trasie aplikacji × oba motywy (kontrast na szkle i tokenach statusu
// różni się między jasnym a ciemnym). Blokujemy tylko serious/critical, WCAG 2 A/AA — jak `a11y.spec.ts`.
const BLOCKING = ['serious', 'critical']
const READY = 45_000
const STATION = '/station/33605?name=Warszawa%20Centralna'

/** Wiersz tablicy → szczegóły połączenia (jak w `smoke.spec.ts`: snapshot pollera przychodzi z opóźnieniem). */
async function openConnection(page: Page): Promise<void> {
  await page.goto(STATION)
  const rowButton = page.locator('td button[aria-label]').first()
  await expect(async () => {
    await page.reload()
    await expect(rowButton).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: READY })
  await rowButton.click()
  await expect(page).toHaveURL(/\/connection\//)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })
}

const ROUTES: { name: string; go: (page: Page) => Promise<void>; ready: (page: Page) => ReturnType<Page['locator']> }[] = [
  { name: 'pulpit', go: (p) => p.goto('/').then(() => undefined), ready: (p) => p.getByRole('heading', { name: 'Start' }) },
  { name: 'tablica stacji', go: (p) => p.goto(STATION).then(() => undefined), ready: (p) => p.getByRole('tablist', { name: 'Kierunek' }) },
  { name: 'szczegóły połączenia', go: openConnection, ready: (p) => p.getByRole('heading', { level: 1 }) },
  { name: 'ekran miasta', go: (p) => p.goto('/city/warszawa').then(() => undefined), ready: (p) => p.getByRole('heading', { name: /Odjazdy i przyjazdy/ }) },
  { name: 'przystanek', go: (p) => p.goto('/city/warszawa/stop/1001').then(() => undefined), ready: (p) => p.getByRole('tablist') },
  { name: 'linie', go: (p) => p.goto('/city/warszawa/lines').then(() => undefined), ready: (p) => p.getByRole('heading', { name: 'Linie — Warszawa' }) },
  { name: 'linia', go: (p) => p.goto('/city/warszawa/line/20').then(() => undefined), ready: (p) => p.getByRole('heading', { name: /^Trasa linii/ }) },
  { name: 'mapa', go: (p) => p.goto('/city/warszawa/map').then(() => undefined), ready: (p) => p.getByRole('button', { name: /Filtry/ }) },
]

for (const theme of ['light', 'dark'] as const) {
  for (const route of ROUTES) {
    test(`a11y: ${route.name} (${theme}) bez naruszeń serious/critical`, async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
      await route.go(page)
      await expect(route.ready(page).first()).toBeAttached({ timeout: READY })
      // Po nawigacji po stronie klienta (wiersz tablicy → połączenie) Next podmienia <title> chwilę po treści — WebKit
      // potrafił go wtedy nie mieć w chwili skanu (document-title, serious).
      await expect(page).toHaveTitle(/.+/)
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))

      const { violations } = await scanA11y(page)
      const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
    })
  }
}
