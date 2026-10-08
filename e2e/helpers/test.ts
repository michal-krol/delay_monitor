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
  page: async ({ page }, provide) => {
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
  },
})

export { expect }
