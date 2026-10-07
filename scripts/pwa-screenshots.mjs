// Zrzuty do manifestu (okno instalacji): npm run build && npm run start (tryb mock, jak e2e), potem node scripts/pwa-screenshots.mjs. Rozmiary muszą zgadzać się z manifest.ts.
import { chromium } from '@playwright/test'

const out = 'public/screenshots'
const base = 'http://localhost:3000'
const browser = await chromium.launch()

async function shot(name, url, viewport, scale, ready) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: 'light', locale: 'pl-PL' })
  const page = await ctx.newPage()
  await page.addInitScript(() => localStorage.setItem('pkp.installDismissed.v1', JSON.stringify({ dismissedAt: 1 })))
  await page.goto(base + url, { waitUntil: 'networkidle', timeout: 120000 })
  await ready(page)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/${name}.png` })
  await ctx.close()
}

const board = async (page) => page.getByRole('heading', { level: 1 }).waitFor()
await shot('stacja-narrow', '/station/33605?name=Warszawa%20Centralna', { width: 360, height: 780 }, 1.5, board)
await shot('mapa-narrow', '/city/warszawa/map', { width: 360, height: 780 }, 1.5, async (page) => {
  await page.waitForTimeout(25000)
})
await shot('stacja-wide', '/station/33605?name=Warszawa%20Centralna', { width: 1280, height: 720 }, 1, async (page) => {
  await board(page)
  // Nazwa gałęzi w stopce paska bocznego (wersja · gałąź) nie trafia do publicznego zrzutu.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('aside *')) if (el.children.length === 0 && /^v\d+\.\d+\.\d+/.test(el.textContent ?? '')) el.style.visibility = 'hidden'
  })
})
await browser.close()
