import { test, expect } from './helpers/test'
import { scanA11y } from './helpers/axe'
import { CITY_MAP, MAP_NAME, READY, openVisibleList } from './helpers/map'
import { SEARCH_FIELD } from './helpers/search'

test('mapa: Szukaj jest zwinięte, zachowuje frazę po zmianie szerokości i oddaje fokus po Escape', async ({ page }) => {
  await page.goto(CITY_MAP)
  await expect(page.getByRole('region', { name: MAP_NAME })).toBeVisible({ timeout: READY })
  const toggle = page.getByRole('button', { name: 'Szukaj', exact: true, expanded: false }).or(page.getByRole('button', { name: 'Szukaj', exact: true, expanded: true }))
  const field = page.getByRole('searchbox', { name: SEARCH_FIELD })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(field).toBeHidden()
  await toggle.click()
  await expect(field).toBeFocused()
  await field.fill('Centrum')
  await toggle.click()
  await expect(field).toBeHidden()
  await page.setViewportSize({ width: 1440, height: 900 })
  await toggle.click()
  await expect(field).toHaveValue('Centrum')
  // Existing UnifiedSearch first handles a nonempty phrase; a second Escape closes the disclosure.
  await field.press('Escape')
  await expect(field).toHaveValue('')
  await field.press('Escape')
  await expect(toggle).toBeFocused()
  await expect(field).toBeHidden()
  await page.setViewportSize({ width: 320, height: 740 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const { violations } = await scanA11y(page)
  expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
})

test('mapa: domyślny panel telefonu zachowuje podsumowanie, obiekty dostępne po rozwinięciu arkusza', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Panel przeglądu jest kompozycją telefonu')
  await page.goto(CITY_MAP)
  await expect(page.getByRole('region', { name: MAP_NAME })).toBeVisible({ timeout: READY })
  const overview = page.getByRole('region', { name: 'Pojazdy i przystanki w widoku' })
  await expect(overview).toBeVisible()
  await openVisibleList(page)
  await expect(overview.getByRole('heading', { name: 'Pojazdy', exact: true })).toBeVisible({ timeout: READY })
})

test('mapa: kontrolki w obu motywach zachowują czytelność i mieszczą się w widoku', async ({ page }, testInfo) => {
  test.slow(true, 'Dwa pełne style mapy i wybór pojazdu w obu motywach')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(CITY_MAP)
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((nextTheme) => localStorage.setItem('theme', nextTheme), theme)
    await page.goto(`${CITY_MAP}?at=52.23000,21.00800,15.0`)
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/)
    const map = page.getByRole('region', { name: MAP_NAME })
    await expect(map).toBeVisible({ timeout: READY })
    const list = await openVisibleList(page)
    await expect(list.getByRole('button', { name: /^Linia 20/ }).first()).toBeVisible({ timeout: READY })
    // Compositor screenshot, never raw WebGL pixels: populated tiles and labels compress above a blank canvas.
    // TransitMap names the canvas itself as its region; it has no nested canvas.
    await expect(async () => expect((await map.screenshot()).byteLength).toBeGreaterThan(8_000)).toPass({ timeout: 15_000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `docs/pr10/${testInfo.project.name}-${theme}.png`, fullPage: true })
    const { violations } = await scanA11y(page)
    expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
    const selectedList = await openVisibleList(page)
    await selectedList.getByRole('button', { name: /^Linia 20/ }).first().click()
    await expect(page.getByRole('dialog', { name: 'tramwaj 20' })).toBeVisible()
    await page.screenshot({ path: `docs/pr10/${testInfo.project.name}-${theme}-selected.png`, fullPage: true })
  }
})
