/** Capture review evidence against a local mock production build; no golden-image assertions. */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

const baseURL = new URL(process.env.UI_BASELINE_URL ?? 'http://127.0.0.1:3137')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(baseURL.hostname)) {
  throw new Error('UI_BASELINE_URL must identify a local mock server')
}
const healthResponse = await fetch(new URL('/api/health', baseURL))
if (!healthResponse.ok) throw new Error(`Health check failed: ${healthResponse.status}`)
const health = await healthResponse.json()
if (health.dataSource !== 'mock' || health.gtfs?.dataSource !== 'mock') {
  throw new Error('Baseline capture requires PKP and GTFS mock data sources')
}

// Playwright clears test-results on every run; keep the reference evidence outside that directory.
const output = path.resolve('docs/ui-refactor/baseline')
await mkdir(output, { recursive: true })
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
  baseURL: baseURL.origin,
  complete: false,
  note: 'Mock scale; request counts describe this capture, not upstream cost or production performance.',
  views: [],
}
const views = [
  { name: 'start-empty', url: '/', ready: p => p.getByRole('heading', { name: 'Start', exact: true }) },
  { name: 'start-pinned', url: '/', ready: p => p.getByRole('heading', { name: 'Moje miejsca', exact: true }) },
  { name: 'search', url: '/search', ready: p => p.getByRole('searchbox', { name: 'Stacja, przystanek lub linia' }) },
  { name: 'station', url: '/station/33605?name=Warszawa%20Centralna', ready: p => p.getByRole('tablist', { name: 'Kierunek' }) },
  { name: 'connection', url: '/station/33605?name=Warszawa%20Centralna', ready: p => p.getByRole('heading', { level: 1 }) },
  { name: 'city', url: '/city/warszawa', ready: p => p.getByRole('heading', { name: /Odjazdy i przyjazdy/ }) },
  { name: 'stop', url: '/city/warszawa/stop/1001', ready: p => p.getByRole('tablist').first() },
  { name: 'lines', url: '/city/warszawa/lines', ready: p => p.getByRole('heading', { name: 'Linie', exact: true, level: 1 }) },
  { name: 'line', url: '/city/warszawa/line/20', ready: p => p.getByRole('heading', { name: /^Trasa linii/ }) },
  { name: 'map', url: '/city/warszawa/map', ready: p => p.getByRole('button', { name: /Filtry/ }) },
]
const browser = await chromium.launch()
try {
  for (const viewport of [{ width: 375, height: 667 }, { width: 1440, height: 1000 }]) {
    for (const theme of ['light', 'dark']) {
      for (const view of views) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
        try {
          await context.addInitScript(({ theme, pinned }) => {
            localStorage.setItem('theme', theme)
            if (pinned) localStorage.setItem('monitor.favourites.v2', JSON.stringify([
              { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
              { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' },
            ]))
          }, { theme, pinned: view.name === 'start-pinned' })
          const page = await context.newPage()
          const requests = {}
          const pageErrors = []
          page.on('pageerror', error => pageErrors.push(error.message))
          page.on('request', request => {
            const url = new URL(request.url())
            if (url.origin === baseURL.origin && url.pathname.startsWith('/api/')) {
              requests[url.pathname] = (requests[url.pathname] ?? 0) + 1
            }
          })
          await page.goto(new URL(view.url, baseURL).href)
          await expect(view.ready(page)).toBeVisible({ timeout: 45_000 })
          if (view.name === 'connection') {
            const train = page.locator('td button[aria-label]').first()
            await expect(async () => {
              await page.reload()
              await expect(train).toBeVisible({ timeout: 5000 })
            }).toPass({ timeout: 45_000 })
            await train.click()
            await expect(page).toHaveURL(/\/connection\//)
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
          }
          await expect(page.locator('html')).toHaveClass(new RegExp(theme))
          await page.evaluate(() => document.fonts.ready)
          // Wait for initial placeholders to settle; this is evidence capture, not a timing assertion.
          await page.waitForTimeout(2000)
          const stem = `${view.name}-${viewport.width}-${theme}`
          await page.screenshot({ path: path.join(output, `${stem}.png`), fullPage: true })
          const layout = await page.evaluate(() => ({
            title: document.title,
            headings: [...document.querySelectorAll('h1')].map(el => el.textContent),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          }))
          report.views.push({ name: view.name, viewport, theme, screenshot: `${stem}.png`, url: page.url(), requests, pageErrors, ...layout })
          console.log(`Captured ${stem}`)
        } finally { await context.close() }
      }
    }
  }
  report.complete = true
} finally {
  await browser.close()
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(`Baseline evidence: ${output}`)
