import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Bramka a11y: blokujemy tylko realne bariery (serious/critical), reszta to
// szum na tym etapie. WCAG 2 A/AA.
const BLOCKING = ['serious', 'critical']

const VIEWS = [
  { name: 'pulpit', path: '/', ready: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: 'Pulpit' }) },
  {
    name: 'tablica stacji',
    path: '/station/33605?name=Warszawa%20Centralna',
    ready: (p: import('@playwright/test').Page) => p.getByRole('tablist', { name: 'Kierunek' }),
  },
  {
    name: 'linie GTFS',
    path: '/city/warszawa/lines',
    ready: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: 'Trasy — Warszawa' }),
  },
  {
    name: 'ekran miasta GTFS',
    path: '/city/warszawa',
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

// Pulpit z przypiętymi kartami (PKP + GTFS): karty, gwiazdki i rozwijane tablice
// nie występują na pustym Pulpicie z powyższej pętli.
test('a11y: pulpit z przypiętymi kartami bez naruszeń serious/critical', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'monitor.favourites.v2',
      JSON.stringify([
        { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
        { kind: 'gtfs', city: 'warszawa', id: '100101', name: 'Centrum 01' },
      ]),
    )
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Warszawa Centralna' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Rozkład — Warszawa')).toBeVisible({ timeout: 15_000 })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

  const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
