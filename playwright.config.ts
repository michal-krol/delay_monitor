import { existsSync } from 'node:fs'
import { chromium, defineConfig, devices, webkit } from '@playwright/test'

// Po podbiciu `@playwright/test` lokalne przeglądarki są w starej wersji i każdy
// test pada osobno na „Executable doesn't exist" (168 razy). Jedna instrukcja
// zamiast tego. CI instaluje przeglądarki samo (ci.yml).
if (!process.env.CI && ![chromium, webkit].every((b) => existsSync(b.executablePath()))) {
  console.error('Brak przeglądarek Playwrighta dla tej wersji — uruchom: npx playwright install chromium webkit')
  process.exit(1)
}

/**
 * Pakiet regresji UI (smoke + a11y). Tryb mock, zerowo-sieciowy wobec PKP
 * i GTFS (#6, #8, #13) — serwer stawiany bez `PKP_API_KEY` i z
 * `GTFS_DATA_SOURCE=mock`. Osobny od `npm run test` (Vitest) i od joba
 * `quality` w CI. Patrz AGENTS.md #16.
 */
// `E2E_PORT`: lokalnie `reuseExistingServer` podpina się pod KAŻDY serwer na tym porcie — także
// z innego worktree/sesji (stary build = fałszywe wyniki). Inny port wymusza świeży build tej gałęzi.
const PORT = Number(process.env.E2E_PORT ?? 3123)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Lokalnie też 1: pełny przebieg pod obciążeniem maszyny dawał 2–8 porażek
  // (np. mapa na mobile-safari), powtórka zawsze zielona. Test, który przechodzi
  // dopiero w powtórce, reporter oznacza jako „flaky" — nie znika z widoku.
  retries: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    // `--webpack` poza CI: w worktree agenta (`.claude/worktrees/**`) `node_modules`
    // leży w głównym checkoutcie, powyżej `turbopack.root` z `next.config.ts`, więc
    // build Turbopackiem pada („Symlink node_modules … points out of the filesystem
    // root"). Webpack rozwiązuje pakiety w górę drzewa i buduje normalnie. CI ma
    // świeży checkout z `node_modules` na miejscu — tam zostaje Turbopack.
    command: `npm run build${process.env.CI ? '' : ' -- --webpack'} && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      E2E: '1',
      PKP_API_KEY: '',
      PKP_DATA_SOURCE: 'mock',
      GTFS_ENABLED: 'true',
      GTFS_CITIES: 'warszawa',
      GTFS_DATA_SOURCE: 'mock',
    },
  },
})
