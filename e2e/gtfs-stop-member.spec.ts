import { test, expect } from '@playwright/test'
import { showLineTimetable } from './helpers/info'
import { scanA11y } from './helpers/axe'

// Mock „Centrum" (zespół 1001) = 4 przystanki z RÓŻNYMI liniami: 100101→20,
// 100102→128/N16, 100103→S2, 100104 (peron 04, wheelchair=2). AGENTS.md #13.
const CENTRUM = '/city/warszawa/stop/1001'

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s) — strona sama
// ponawia, więc czekamy z zapasem na pierwszą treść z rozkładu.
const READY = 45_000

test('przystanek miejski: przełącznik przystanków zespołu', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()

  // Nagłówek „Przystanki w zespole” jest na telefonie tylko dla czytnika (PR4) — przełącznik po roli.
  const switcher = page.getByRole('tablist', { name: 'Przystanek w zespole' })
  await expect(switcher).toBeVisible({ timeout: READY })

  // „Cały zespół" + jeden przycisk na przystanek, konwencja ZTM „Centrum 02".
  await expect(page.getByRole('tab', { name: /Cały zespół/ })).toBeVisible()
  const stop02 = page.getByRole('tab', { name: /^Centrum 02/ })
  await expect(stop02).toBeVisible()

  // Wybór przystanku: nagłówek dostaje podtytuł, tab jest zaznaczony.
  await stop02.click()
  await expect(stop02).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText(/^Centrum 02/).first()).toBeVisible()

  // Powrót do całego zespołu — odjazdy tagowane numerem przystanku.
  await page.getByRole('tab', { name: /Cały zespół/ }).click()
  // Po tytule tagu: `getByText(/^0\d$/)` trafiał dotąd w oś „00” wykresu w prawej kolumnie, nie w tag (PR4).
  await expect(page.getByTitle(/^Odjazd z przystanku 0\d$/).first()).toBeVisible({ timeout: READY })

  // Pogoda w kontekście miasta obecna na każdym ekranie GTFS (#5 / to ważne): chip w górnym pasku.
  await expect(page.getByRole('button', { name: /^Pogoda:/ })).toBeVisible()
})

test('przystanek miejski: deep-link przystanku od razu go podświetla', async ({ page }) => {
  await page.goto('/city/warszawa/stop/100101')
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: /^Centrum 01/ })).toHaveAttribute('aria-selected', 'true', {
    timeout: READY,
  })
})

test('przystanek miejski: `?przystanek=` w URL od razu podświetla przystanek i klik go aktualizuje', async ({ page }) => {
  await page.goto(`${CENTRUM}?przystanek=100102`)
  await expect(page.getByRole('tab', { name: /^Centrum 02/ })).toHaveAttribute('aria-selected', 'true', {
    timeout: READY,
  })

  await page.getByRole('tab', { name: /^Centrum 01/ }).click()
  await expect(page).toHaveURL(/przystanek=100101/)
})

test('przystanek miejski: stary link `?slupek=` pokazuje cały zespół', async ({ page }) => {
  await page.goto(`${CENTRUM}?slupek=100102`)
  await expect(page.getByRole('tab', { name: /Cały zespół/ })).toHaveAttribute('aria-selected', 'true', { timeout: READY })
})

test('przystanek miejski: przypięty „Centrum 02" trafia na Pulpit z numerem', async ({ page }) => {
  await page.goto(CENTRUM)
  const stop02 = page.getByRole('tab', { name: /^Centrum 02/ })
  await stop02.click({ timeout: READY })
  await expect(stop02).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Przypnij do Startu' }).click()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Centrum 02', exact: true })).toBeVisible({ timeout: READY })
})

test('przystanek metra z dwukropkiem w ID: link z linii prowadzi do tablicy, nie 404', async ({ page }) => {
  // Regresja: `7014M:P1` (peron metra, AGENTS.md #13) — `:` w GTFS stop ID
  // gubi się w hydracji dynamicznego segmentu Next.js przy przejściu klientem
  // (klik linku, nie `page.goto` gotowego URL-a — inaczej test nie łapie tego,
  // co łapie prawdziwy routing). Musi zadziałać przez klik ORAZ po twardym
  // przeładowaniu tego samego URL-a (`decodeStopIdFromPathSegment`).
  await page.goto('/city/warszawa/line/M1')
  await showLineTimetable(page)
  const link = page.getByRole('link', { name: /pełna tablica przystanku/ })
  await expect(link).toBeVisible({ timeout: READY })

  await link.click()
  await expect(page).not.toHaveTitle(/404/)
  await expect(page.getByRole('heading', { name: 'Świętokrzyska', exact: true })).toBeVisible({ timeout: READY })

  await page.reload()
  await expect(page).not.toHaveTitle(/404/)
  await expect(page.getByRole('heading', { name: 'Świętokrzyska', exact: true })).toBeVisible({ timeout: READY })
})

test('a11y: szczegóły przystanku miejskiego bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(CENTRUM)
  await expect(page.getByText('Przystanki w zespole', { exact: false })).toBeVisible({ timeout: READY })

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
