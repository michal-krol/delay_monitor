import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Pasek boczny jest `hidden sm:flex` — poniżej `sm` (mobile-chromium/mobile-safari)
// nawigacja jest wyłącznie w szufladzie za hamburgerem. Na desktop-chromium
// szuflady nie ma (pasek widoczny na stałe), więc te testy są mobile-only.
const isMobile = (name: string) => name !== 'desktop-chromium'

test('mobile: hamburger otwiera szufladę, link nawiguje i zamyka ją', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'szuflada tylko poniżej sm')

  await page.goto('/')
  const hamburger = page.getByRole('button', { name: /otwórz menu/i })
  await expect(hamburger).toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  await hamburger.click()
  const drawer = page.getByRole('dialog', { name: 'Menu nawigacji' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('link', { name: 'Pulpit' })).toHaveAttribute('aria-current', 'page')

  await drawer.getByRole('link', { name: 'Trasy' }).click()
  await expect(page).toHaveURL(/\/miasto\/[^/]+\/linie/)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('mobile: Escape zamyka szufladę', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'szuflada tylko poniżej sm')

  await page.goto('/')
  await page.getByRole('button', { name: /otwórz menu/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('mobile: desktopowy pasek boczny jest schowany', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'dotyczy tylko mobile')

  await page.goto('/')
  // Pasek boczny to <complementary>/<aside> z przyciskiem „Zwiń/Rozwiń pasek boczny";
  // poniżej sm go nie ma.
  await expect(page.getByRole('button', { name: /zwiń pasek boczny|rozwiń pasek boczny/i })).not.toBeVisible()
})

test('a11y: otwarta szuflada mobilna bez naruszeń serious/critical', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'szuflada tylko poniżej sm')

  await page.goto('/')
  await page.getByRole('button', { name: /otwórz menu/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
