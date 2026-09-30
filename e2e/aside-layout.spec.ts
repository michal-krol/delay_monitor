import { test, expect, type Page } from '@playwright/test'

// Wewnętrzna prawa kolumna FullBoard/ConnectionDetails/TransitStopDetail wchodzi pod
// treść poniżej `xl` — przy 1024 px pasek boczny + druga kolumna ściskały treść do ~350 px
// i tabela odjazdów przewijała się w poziomie (zmierzone 2026-09-29: 552/311).

// Ta sama formuła co w `map.spec.ts` — mock rebase'uje operatingDate do dziś.
function warsawToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
}

const PAGES = [
  { name: 'stacja', path: '/station/33605' },
  { name: 'połączenie', path: `/connection/2026/104/${warsawToday()}` },
  { name: 'przystanek', path: '/city/warszawa/stop/100101' },
]

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'szerokości tabletu/laptopa — tylko desktop')
})

/** Ramki prawej kolumny i elementu tuż przed nią (główna kolumna siatki). */
async function asideAndContentBoxes(page: Page) {
  const aside = page.locator('main aside').first()
  await expect(aside).toBeVisible({ timeout: 45_000 })
  return aside.evaluate((el) => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    return { aside: box(el), content: box(el.previousElementSibling!) }
  })
}

test('tabela odjazdów na 1024 px mieści się bez poziomego przewijania', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/station/33605')
  // Pusta tabela (przed pierwszym snapshotem) jest wąska — mierzymy dopiero z wierszami.
  // Reload jak w `smoke.spec.ts`: klient po serii szybkich prób odpytuje co 30 s.
  const rowButton = page.locator('td button[aria-label]').first()
  await expect(async () => {
    await page.reload()
    await expect(rowButton).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })
  const table = page.locator('table').first()

  const { scrollWidth, clientWidth } = await table.evaluate((el) => ({
    scrollWidth: el.parentElement!.scrollWidth,
    clientWidth: el.parentElement!.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

for (const { name, path } of PAGES) {
  test(`${name}: prawa kolumna pod treścią na 1024 px`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto(path)
    const { aside, content } = await asideAndContentBoxes(page)
    expect(aside.top).toBeGreaterThanOrEqual(content.bottom)
  })

  test(`${name}: prawa kolumna obok treści na 1280 px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(path)
    const { aside, content } = await asideAndContentBoxes(page)
    expect(aside.left).toBeGreaterThanOrEqual(content.right)
  })
}
