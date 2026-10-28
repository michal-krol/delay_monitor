import { test, expect } from './helpers/test'
import { openMap } from './helpers/map'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

for (const width of [320, 375, 480, 1280]) {
  for (const dark of [false, true]) {
    test(`map refinement ${width}px ${dark ? 'dark' : 'light'}: controls and bottom attribution`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      await openMap(page, '/city/warszawa/map?mode=bus&hide=tram,metro&vehicles=0&rail=0&review=1')
      await page.locator('[data-map-search-trigger]').click()
      await expect.poll(() => new URL(page.url()).searchParams.has('hide')).toBe(false)
      expect(new URL(page.url()).searchParams.get('review')).toBe('1')
      for (const key of ['mode', 'vehicles', 'rail']) expect(new URL(page.url()).searchParams.has(key)).toBe(false)
      await expect(page.getByRole('button', { name: 'Lista', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Pokaż całe miasto/ })).toHaveCount(0)
      await expect(page.getByRole('group', { name: 'Rodzaje pojazdów' })).toHaveCount(0)
      if (dark) await changeTheme(page, 'Przełącz na tryb ciemny')
      const locate = page.getByRole('button', { name: 'Moja lokalizacja', exact: true })
      const map = page.locator('.transit-map')
      await expect(locate).toBeVisible()
      const mb = await map.boundingBox(), lb = await locate.boundingBox()
      expect(lb!.y - mb!.y).toBeLessThan(180)
      expect(lb!.height).toBeGreaterThanOrEqual(44)
      expect(lb!.width).toBeGreaterThanOrEqual(44)
      const zoom = await page.getByRole('button', { name: 'Przybliż', exact: true }).boundingBox()
      expect(zoom!.width).toBeGreaterThanOrEqual(44)
      expect(zoom!.height).toBeGreaterThanOrEqual(44)
      const credits = page.locator('.maplibregl-ctrl-attrib')
      const toggle = credits.getByRole('button')
      if (await toggle.isVisible()) {
        const target = await toggle.boundingBox()
        expect(target!.width).toBeGreaterThanOrEqual(44)
        expect(target!.height).toBeGreaterThanOrEqual(44)
        await toggle.click()
      }
      const source = credits.getByRole('link', { name: 'OpenFreeMap', exact: true })
      await expect(source).toBeVisible()
      const hitSource = () => credits.getByRole('link').evaluateAll((links) => links.every((el) => {
        const box = el.getBoundingClientRect()
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return hit === el || el.contains(hit)
      }))
      await expect.poll(hitSource).toBe(true)
      await expect(credits.locator('.maplibregl-ctrl-attrib-button')).toHaveCSS('background-repeat', 'no-repeat')
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      const mapControl = (name: string) => name === 'Szukaj' ? page.locator('[data-map-search-trigger]') : page.getByRole('button', { name, exact: true })
      for (const name of ['Szukaj', 'Z utrudnieniami', 'Moja lokalizacja']) {
        const control = mapControl(name)
        await expect.poll(() => control.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          return hit === el || el.contains(hit)
        })).toBe(true)
      }
      const locateBox = await locate.boundingBox()
      for (const name of ['Szukaj', 'Z utrudnieniami']) {
        const box = await mapControl(name).boundingBox()
        expect(box!.x + box!.width <= locateBox!.x || box!.x >= locateBox!.x + locateBox!.width || box!.y + box!.height <= locateBox!.y || box!.y >= locateBox!.y + locateBox!.height).toBe(true)
      }
      if (width < 640) {
        const handle = page.getByRole('button', { name: /^Zmień wysokość panelu/ })
        for (const snap of ['half', 'full']) {
          // WebKit's locator auto-scroll can snap this scroll container back before clicking.
          // Tap the visible handle as a user would, without a preparatory scrollIntoView.
          const box = await handle.boundingBox()
          expect(box).not.toBeNull()
          if (info.project.use.hasTouch) await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2)
          else await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
          await expect(page.locator('.bottom-sheet')).toHaveAttribute('data-snap', snap)
          await expect.poll(() => page.locator('.bottom-sheet').evaluate((el, fraction) => Math.abs(el.scrollTop - fraction * el.clientHeight), snap === 'half' ? 0.55 : 0.9)).toBeLessThanOrEqual(2)
          await expect.poll(hitSource).toBe(true)
        }
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      await expect.poll(hitSource).toBe(true)
      const compactButton = credits.locator('.maplibregl-ctrl-attrib-button')
      if (await compactButton.isVisible()) {
        const buttonBox = await compactButton.boundingBox(), creditsBox = await credits.boundingBox()
        expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(creditsBox!.y + creditsBox!.height + 1)
        for (const link of await credits.getByRole('link').all()) {
          const box = await link.boundingBox()
          expect(box!.x + box!.width <= buttonBox!.x || box!.y + box!.height <= buttonBox!.y || box!.y >= buttonBox!.y + buttonBox!.height).toBe(true)
        }
      }
      expect((await scanA11y(page)).violations).toEqual([])
      await page.screenshot({ path: `docs/emulator-ui/map-${info.project.name}-${width}-${dark ? 'dark' : 'light'}-200.png`, fullPage: true, animations: 'disabled' })
    })
  }
}
