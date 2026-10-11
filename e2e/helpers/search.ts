import { expect, type Locator, type Page } from '@playwright/test'

export const SEARCH_DIALOG = 'Szukaj stacji, przystanku lub linii'
/** Nazwa pola wspólnej wyszukiwarki (`UnifiedSearch`) — to samo w oknie desktopu i na stronie `/search`. */
export const SEARCH_FIELD = 'Stacja, przystanek lub linia'

export const isDesktop = (project: string) => project === 'desktop-chromium'

/** Pole wyszukiwania na danej powierzchni (okno albo `main` strony `/search`). */
export const searchField = (surface: Locator) => surface.getByRole('searchbox', { name: SEARCH_FIELD })

/**
 * Otwiera globalne wyszukiwanie i zwraca jego powierzchnię: desktop skrótem Ctrl+K → okno (`dialog`),
 * telefon przyciskiem „Szukaj" w dolnym pasku → trasa `/search` (zwracany jest `main`).
 * Przycisk i skrót działają dopiero po hydracji; klik/klawisz przed nią znika bez śladu (flaky na zimnym starcie).
 */
export async function openSearch(page: Page, project: string): Promise<Locator> {
  await page.waitForLoadState('networkidle')
  if (isDesktop(project)) {
    await page.keyboard.press('Control+K')
    const dialog = page.getByRole('dialog', { name: SEARCH_DIALOG })
    await expect(dialog).toBeVisible()
    return dialog
  }
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: 'Szukaj' }).click()
  await expect(page).toHaveURL(/\/search(\?|$)/)
  const surface = page.getByRole('main')
  await expect(searchField(surface)).toBeVisible()
  return surface
}
