import { test, expect, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'

// Pulpit-dane (PR1 planu UI/UX): „Dodaj" przypina, „Edytuj ulubione" zmienia kolejność i odpina z „Cofnij".
// Mock: prawdziwe ID stacji (AGENTS.md #8), przystanek miejski Warszawy `1001` („Centrum").

const PINNED = [
  { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
  { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' },
]

/** Tylko gdy klucza brak: skrypt startowy biegnie też przy `reload()` i nadpisałby zapisaną kolejność. */
async function seed(page: Page, pinnedItems: unknown[]): Promise<void> {
  await page.addInitScript((value) => {
    if (window.localStorage.getItem('monitor.favourites.v2') === null) window.localStorage.setItem('monitor.favourites.v2', JSON.stringify(value))
  }, pinnedItems)
}

function cardHeadings(page: Page) {
  return page.getByRole('main').getByRole('heading', { level: 2 })
}

test('„Dodaj" przypina wybraną stację i potwierdza, zostając na Pulpicie', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Dodaj' }).click()
  const dialog = page.getByRole('dialog', { name: 'Przypnij do Startu' })
  await dialog.getByRole('combobox').fill('Centralna')
  // Rozkład miejski mocka parsuje się raz przy starcie — wyszukiwarka ponawia, dopóki nie jest gotowy.
  await dialog.getByRole('option', { name: /Warszawa Centralna/ }).first().click({ timeout: 45_000 })

  await expect(page.getByRole('status').filter({ hasText: 'Przypięto do Startu' })).toHaveText('Przypięto do Startu: Warszawa Centralna')
  await expect(page).toHaveURL(/\/$/)
  await expect(cardHeadings(page)).toHaveText(['Warszawa Centralna'])
  expect(await page.evaluate(() => window.localStorage.getItem('monitor.favourites.v2'))).toContain('33605')
})

test('„Edytuj ulubione": W dół trzyma fokus, kolejność kart wspólna dla kolei i komunikacji miejskiej', async ({ page }) => {
  await seed(page, PINNED)
  await page.goto('/')
  await expect(cardHeadings(page)).toHaveText(['Warszawa Centralna', 'Centrum'], { timeout: 45_000 })

  await page.getByRole('button', { name: 'Edytuj ulubione' }).click()
  const down = page.getByRole('button', { name: 'W dół: Warszawa Centralna' })
  await down.click()
  // Przeniesiony wiersz gubiłby fokus — przycisk dostaje go z powrotem (na krańcu: aria-disabled, nadal fokusowalny).
  await expect(down).toBeFocused()
  await expect(down).toHaveAttribute('aria-disabled', 'true')

  await page.getByRole('button', { name: 'Gotowe' }).click()
  await expect(cardHeadings(page)).toHaveText(['Centrum', 'Warszawa Centralna'])

  await page.reload()
  await expect(cardHeadings(page)).toHaveText(['Centrum', 'Warszawa Centralna'], { timeout: 45_000 })
})

test('odpięcie w edycji: fokus na „Cofnij", które przywraca wpis na dawne miejsce; axe bez naruszeń', async ({ page }) => {
  await seed(page, PINNED)
  await page.goto('/')
  await page.getByRole('button', { name: 'Edytuj ulubione' }).click()
  await page.getByRole('button', { name: 'Odepnij ze Startu: Warszawa Centralna' }).click()

  const undo = page.getByRole('button', { name: 'Cofnij' })
  await expect(undo).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Odpięto' })).toHaveText('Odpięto ze Startu: Warszawa Centralna')
  expect((await scanA11y(page)).violations).toEqual([])

  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Kolejność przypiętych' }).getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Gotowe' })).toBeFocused()
  await page.getByRole('button', { name: 'Gotowe' }).click()
  await expect(cardHeadings(page)).toHaveText(['Warszawa Centralna', 'Centrum'], { timeout: 45_000 })
})

// Pulpit-karty (PR2): nagłówek i każdy z dwóch kursów to osobne linki, bez nakładki na całą kartę.
test('karty: nagłówek prowadzi do tablicy, kurs PKP do połączenia, kurs miejski do linii', async ({ page }) => {
  await seed(page, PINNED)
  await page.goto('/')
  const [rail, city] = [page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Warszawa Centralna' }) }), page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Centrum' }) })]
  await expect(rail.getByRole('heading').getByRole('link')).toHaveAttribute('href', '/station/33605?name=Warszawa%20Centralna')
  await expect(rail.getByRole('listitem').getByRole('link')).toHaveCount(2)
  await expect(rail.getByRole('listitem').getByRole('link').first()).toHaveAttribute('href', /^\/connection\//)
  await expect(city.getByTestId('departure-list').getByRole('link').first()).toHaveAttribute('href', /^\/city\/warszawa\/line\//, { timeout: 45_000 })
  await expect(city.getByTestId('departure-list')).toContainText('wg rozkładu')
  await expect(page.getByRole('main').getByRole('button', { name: /Pokaż/ })).toHaveCount(0)

  await rail.getByRole('listitem').getByRole('link').first().click()
  await expect(page).toHaveURL(/\/connection\//)
})
