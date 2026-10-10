import { expect, type Page } from '@playwright/test'

export const SEARCH_DIALOG = 'Szukaj stacji lub przystanku'

/**
 * Otwiera globalne okno wyszukiwania: desktop skrótem Ctrl+K, telefon przyciskiem „Szukaj" w dolnym pasku.
 * Przycisk i skrót działają dopiero po hydracji; klik/klawisz przed nią znika bez śladu (flaky na zimnym starcie).
 */
export async function openSearch(page: Page, project: string) {
  await page.waitForLoadState('networkidle')
  if (project === 'desktop-chromium') await page.keyboard.press('Control+K')
  else await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: 'Szukaj' }).click()
  const dialog = page.getByRole('dialog', { name: SEARCH_DIALOG })
  await expect(dialog).toBeVisible()
  return dialog
}
