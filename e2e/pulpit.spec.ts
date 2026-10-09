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
  const dialog = page.getByRole('dialog', { name: 'Przypnij do Pulpitu' })
  await dialog.getByRole('combobox').fill('Centralna')
  // Rozkład miejski mocka parsuje się raz przy starcie — wyszukiwarka ponawia, dopóki nie jest gotowy.
  await dialog.getByRole('option', { name: /Warszawa Centralna/ }).first().click({ timeout: 45_000 })

  await expect(page.getByRole('status').filter({ hasText: 'Przypięto do Pulpitu' })).toHaveText('Przypięto do Pulpitu: Warszawa Centralna')
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
  await page.getByRole('button', { name: 'Odepnij z Pulpitu: Warszawa Centralna' }).click()

  const undo = page.getByRole('button', { name: 'Cofnij' })
  await expect(undo).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Odpięto' })).toHaveText('Odpięto z Pulpitu: Warszawa Centralna')
  expect((await scanA11y(page)).violations).toEqual([])

  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Kolejność przypiętych' }).getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Gotowe' })).toBeFocused()
  await page.getByRole('button', { name: 'Gotowe' }).click()
  await expect(cardHeadings(page)).toHaveText(['Warszawa Centralna', 'Centrum'], { timeout: 45_000 })
})
