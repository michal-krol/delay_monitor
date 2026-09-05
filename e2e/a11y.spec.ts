import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Bramka a11y: blokujemy tylko realne bariery (serious/critical), reszta to
// szum na tym etapie. WCAG 2 A/AA.
const BLOCKING = ['serious', 'critical']

const VIEWS = [
  { name: 'pulpit', path: '/', ready: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: 'Pulpit' }) },
  {
    name: 'tablica stacji',
    path: '/odjazdy/33605?name=Warszawa%20Centralna',
    ready: (p: import('@playwright/test').Page) => p.getByRole('tablist', { name: 'Kierunek' }),
  },
  {
    name: 'linie GTFS',
    path: '/miasto/warszawa/linie',
    ready: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: 'Trasy — Warszawa' }),
  },
  {
    name: 'ekran miasta GTFS',
    path: '/miasto/warszawa',
    ready: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: /Odjazdy i przyjazdy/ }),
  },
]

for (const view of VIEWS) {
  test(`a11y: ${view.name} bez naruszeń serious/critical`, async ({ page }) => {
    await page.goto(view.path)
    await expect(view.ready(page)).toBeVisible({ timeout: 15_000 })

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

    const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  })
}
