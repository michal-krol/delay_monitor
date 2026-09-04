import { defineConfig, devices } from '@playwright/test'

/**
 * Pakiet regresji UI (smoke + a11y). Tryb mock, zerowo-sieciowy wobec PKP
 * i GTFS (#6, #8, #13) — serwer stawiany bez `PKP_API_KEY` i z
 * `GTFS_DATA_SOURCE=mock`. Osobny od `npm run test` (Vitest) i od joba
 * `quality` w CI. Patrz AGENTS.md #16.
 */
const PORT = 3123
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
