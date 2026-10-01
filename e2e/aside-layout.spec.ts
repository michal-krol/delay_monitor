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

// Fixture'y mają krótkie „przez …", a `truncate` nie kurczy komórki (min-content = pełny tekst):
// na stagingu prawdziwe „przez Warszawa Wschodnia, Wołomin, Tłuszcz · +15 przystanków" rozpychało
// kolumnę „Kierunek" do 288 px i tabela 684 px przewijała się w kontenerze 567 px przy 1280 px
// (QA 2026-10-01). Dlatego pociąg 105 w mocku ma długą listę (AGENTS.md #8, `testing.md`).
const LONG_VIA = /^przez .{50,}/

for (const width of [1280, 1024]) {
  test(`tabela odjazdów na ${width} px mieści się bez poziomego przewijania także z długim „przez …"`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/station/33605')
    // Pusta tabela (przed pierwszym snapshotem) jest wąska — mierzymy dopiero z wierszami.
    // Reload jak w `smoke.spec.ts`: klient po serii szybkich prób odpytuje co 30 s.
    const longVia = page.locator('td[data-cell="direction"] span').filter({ hasText: LONG_VIA }).first()
    await expect(async () => {
      await page.reload()
      await expect(longVia).toBeAttached({ timeout: 5_000 })
    }).toPass({ timeout: 40_000 })
    const table = page.locator('table').first()

    const { scrollWidth, clientWidth } = await table.evaluate((el) => ({
      scrollWidth: el.parentElement!.scrollWidth,
      clientWidth: el.parentElement!.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
}

// „Kierunek" bierze całe wolne miejsce (`w-full max-w-0`), więc pozostałe kolumny dostają tylko
// min-content — w szerokiej tabeli plakietka „jeszcze nie wyjechał" i „nie podano" łamały się
// mimo wolnego miejsca. W wąskiej (< 42rem) wolno im się łamać, jak przed zmianą.
test('tabela odjazdów na 1600 px: peron i status w jednej linii', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/station/33605')
  const cells = page.locator('td[data-cell="platform"], td[data-cell="status"]')
  await expect(async () => {
    await page.reload()
    await expect(cells.first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })
  // Liczba linii każdego węzła tekstu = liczba różnych `top` jego prostokątów.
  const wrapped = await cells.evaluateAll((tds) => {
    const result: string[] = []
    for (const td of tds) {
      const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
        if (tops.size > 1) result.push(node.textContent ?? '')
      }
    }
    return result
  })
  expect(wrapped).toEqual([])
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
