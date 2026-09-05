import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const READY = 45_000

test('linia: aktywny alert z fixture\'u pokazuje baner utrudnienia, alert linii 999 nie', async ({ page }) => {
  await page.goto('/miasto/warszawa/linia/20')
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
  await expect(page.getByRole('link', { name: /Szczegóły/ })).toHaveAttribute('href', 'https://www.wtp.waw.pl/utrudnienia/test-1/')
  // W TEJ SAMEJ nawigacji, PO potwierdzeniu, że baner w ogóle się renderuje —
  // inaczej ten test przechodzi nawet gdyby renderowanie alertów było całkiem
  // zepsute (fixture ma trzeci alert bez żadnej linii, ale linia 999 nie jest
  // obsługiwana przez linię 20, więc jej tekst nie może się pojawić).
  await expect(page.getByText('Utrudnienie na linii spoza fixture\'u')).not.toBeVisible()
})

test('przystanek: baner utrudnienia linii 20 widoczny też zawężony do jednego słupka (?slupek= deep-link)', async ({ page }) => {
  // Regresja: 100101 to słupek zespołu 1001 (Centrum), obsługiwany przez
  // linię 20 (patrz fixtures/gtfs/warszawa/stop_times.txt). Handler
  // `/api/gtfs/board` kiedyś dopasowywał alerty po `scopeId ?? group.id`,
  // a `groupRoutes` zna tylko klucze zespołów — słupek zawężał wynik do [].
  await page.goto('/miasto/warszawa/przystanek/100101')
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible({ timeout: READY })
  await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
})

test('a11y: strona linii z widocznym banerem utrudnienia bez naruszeń serious/critical', async ({ page }) => {
  await page.goto('/miasto/warszawa/linia/20')
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
