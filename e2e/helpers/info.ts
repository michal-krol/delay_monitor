import { expect, type Page } from '@playwright/test'

/**
 * Kontekst tablicy stacji/przystanku (pogoda, mapa, natężenie, linie): od `sm` w prawej kolumnie,
 * na telefonie w arkuszu „Info” (PR4). Na wąskim ekranie otwiera arkusz; na szerokim nic nie robi.
 * `toPass`, bo klik przed hydracją przepada bez śladu (jak w `openSearch`).
 */
/**
 * Strona linii poniżej `lg` pokazuje jedną sekcję naraz (PR4): przełącza na „Rozkład”.
 * Od `lg` obie sekcje są obok siebie, przełącznik ukryty — nic nie robi.
 */
export async function showLineTimetable(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /^Trasa linii/ })).toBeAttached({ timeout: 45_000 })
  if ((page.viewportSize()?.width ?? 1280) >= 1024) return
  const button = page.getByRole('group', { name: 'Widok linii' }).getByRole('button', { name: 'Rozkład' })
  await expect(async () => {
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 45_000 })
}

export async function showBoardContext(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) >= 640) return
  const info = page.getByRole('button', { name: 'Info' })
  await expect(async () => {
    if ((await info.getAttribute('aria-expanded')) !== 'true') await info.click()
    await expect(page.getByRole('dialog', { name: /^Informacje o / })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 45_000 })
}

/**
 * Mapa stacji/przystanku: od `sm` w prawej kolumnie; na telefonie w arkuszu „Info” w zwiniętej sekcji
 * „Mapa”, montowana dopiero po rozwinięciu (PR5) — otwiera arkusz i rozwija sekcję.
 */
export async function showBoardMap(page: Page): Promise<void> {
  await showBoardContext(page)
  if ((page.viewportSize()?.width ?? 1280) >= 640) return
  const toggle = page.getByRole('dialog', { name: /^Informacje o / }).getByRole('button', { name: 'Mapa', exact: true })
  // Sekcja mapy pojawia się dopiero, gdy znamy lokalizację (stacja: po odpowiedzi pogody).
  await expect(toggle).toBeVisible({ timeout: 45_000 })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}
