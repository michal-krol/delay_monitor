import { test as base, expect } from '@playwright/test'

/**
 * `test` ze wspólnym buforem kafelków OpenFreeMap (jedyny ruch poza serwer testowy, AGENTS.md #6).
 * Każdy test ma świeży kontekst, więc bez bufora każda mapa pobierała style, glify i kafle z internetu
 * od zera. Bufor żyje w procesie workera: pierwszy test pobiera naprawdę (mapa nadal rysuje prawdziwe
 * kafelki — `expectTilesRendered` nic nie traci), kolejne dostają kopię z pamięci. Test, który sam
 * stawia `page.route` na kafelki (np. abort), wygrywa — trasy dodane później mają pierwszeństwo.
 */
interface Cached {
  status: number
  headers: Record<string, string>
  body: Buffer
}
const cache = new Map<string, Promise<Cached | null>>()

export const test = base.extend({
  page: async ({ page }, provide, info) => {
    // Preserve evidence of intermittent map startup failures without querying an unresponsive page during teardown.
    const started = Date.now()
    const events: { ms: number; kind: string; detail: string }[] = []
    const record = (kind: string, detail: string) => {
      events.push({ ms: Date.now() - started, kind, detail: detail.slice(0, 2_000) })
      if (events.length > 100) events.shift()
    }
    page.on('pageerror', (error) => record('pageerror', error.stack ?? error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') record(message.type(), message.text())
    })
    page.on('requestfailed', (request) => record('requestfailed', `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`))
    page.on('request', (request) => {
      if (request.resourceType() === 'script') record('script-request', new URL(request.url()).pathname)
    })
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script' || response.status() >= 400) {
        record('response', `${response.status()} ${new URL(response.url()).pathname}`)
      }
    })
    await page.route('https://tiles.openfreemap.org/**', async (route) => {
      const url = route.request().url()
      let hit = cache.get(url)
      if (!hit) {
        hit = route
          .fetch()
          .then(async (res) => (res.ok() ? { status: res.status(), headers: res.headers(), body: await res.body() } : null))
          .catch(() => null)
        cache.set(url, hit)
      }
      const entry = await hit
      if (entry) await route.fulfill(entry)
      else await route.fallback()
    })
    await provide(page)
    if (info.status !== info.expectedStatus) {
      await info.attach('browser-startup-diagnostics', { body: JSON.stringify(events, null, 2), contentType: 'application/json' })
    }
  },
})

export { expect }
