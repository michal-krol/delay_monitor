import { test, expect } from './helpers/test'
import { scanA11y } from './helpers/axe'
import { changeTheme } from './helpers/page-options'

for (const width of [320, 375, 480, 1280]) {
  for (const dark of [false, true]) {
    test(`line review ${width}px ${dark ? 'dark' : 'light'}: timetable to actual course`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript(() => localStorage.setItem('pkp.installDismissed.v1', JSON.stringify({ dismissedAt: Date.now() })))
      await page.goto('/city/warszawa/line/20?dir=1&stop=700201&day=saturday&pane=timetable')
      const heading = page.getByRole('heading', { level: 2, name: 'Rozkład: Rondo ONZ', exact: true })
      await expect(heading).toBeVisible({ timeout: 45_000 })
      if (dark) await changeTheme(page, 'Przełącz na tryb ciemny')
      await expect(page.getByRole('group', { name: 'Wybrany rozkład' })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Pojazdy linii' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Odjazdy z przystanku', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Pogoda:/ })).toBeVisible()
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      await expect.poll(overflow).toBeLessThanOrEqual(0)
      if (width < 1024) {
        const days = page.getByRole('group', { name: 'Kategoria dnia' })
        for (const [name, label] of [['Poniedziałek – Piątek', 'Pon–Pt'], ['Sobota', 'Sb'], ['Niedziela i święta', 'Nd']]) {
          const button = days.getByRole('button', { name, exact: true })
          await expect(button).toHaveText(label)
          const box = await button.boundingBox()
          expect(box!.width).toBeGreaterThanOrEqual(44)
          expect(box!.height).toBeGreaterThanOrEqual(44)
        }
        const saturday = days.getByRole('button', { name: 'Sobota', exact: true })
        await saturday.focus()
        await page.keyboard.press('Space')
        await expect(saturday).toBeFocused()
        await expect(saturday).toHaveAttribute('aria-pressed', 'true')
      }
      expect((await scanA11y(page)).violations).toEqual([])
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.screenshot({ path: `docs/emulator-ui/line-${info.project.name}-${width}-${dark ? 'dark' : 'light'}-200.png`, animations: 'disabled' })
      const course = page.getByRole('group', { name: 'Sobota', exact: true }).getByRole('link').first()
      const href = await course.getAttribute('href')
      expect(href).toMatch(/trip=.+date=.+stop=700201.+seq=/)
      await course.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new URL(href!, page.url()).href)
      await expect(page.getByRole('heading', { name: 'Kurs linii 20', exact: true })).toBeVisible()
      await expect.poll(overflow).toBeLessThanOrEqual(0)
      expect((await scanA11y(page)).violations).toEqual([])
    })
  }
}
