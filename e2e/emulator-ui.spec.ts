import { test, expect } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

const places = [
  { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
  { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' },
]

for (const width of [320, 375, 480, 1280]) {
  for (const dark of [false, true]) {
    test(`emulator review: Start ${width}px ${dark ? 'dark' : 'light'} and enlarged text`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript((value) => localStorage.setItem('monitor.favourites.v2', JSON.stringify(value)), places)
      await page.goto('/')
      await expect(page.getByRole('article')).toHaveCount(2)
      await expect(page.getByTestId('departure-list').getByRole('listitem').first()).toBeVisible({ timeout: 45_000 })
      if (dark) await changeTheme(page, 'Przełącz na tryb ciemny')
      const nearby = page.getByRole('button', { name: 'W pobliżu mnie', exact: true })
      await expect(nearby).toBeVisible()
      const box = await nearby.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
      await expect(page.getByRole('button', { name: 'Dodaj', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Otwórz mapę', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Pogoda:/ })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Mapa', exact: true }).first()).toBeVisible()
      await expect(page.locator('summary:visible').filter({ hasText: /^Dane/ })).toBeVisible()
      for (const scale of [100, 200]) {
        await page.evaluate((value) => { document.documentElement.style.fontSize = `${value}%` }, scale)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
        expect((await scanA11y(page)).violations).toEqual([])
        await page.screenshot({ path: `docs/emulator-ui/${info.project.name}-${width}-${dark ? 'dark' : 'light'}-${scale}.png`, fullPage: true, animations: 'disabled' })
      }
    })
  }
}
