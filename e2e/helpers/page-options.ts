import { expect, type Page } from '@playwright/test'

export async function openPageOptions(page: Page) {
  const trigger = page.getByRole('button', { name: 'Więcej opcji strony', exact: true }).filter({ visible: true })
  await expect(trigger).toBeVisible()
  if (await trigger.getAttribute('aria-expanded') !== 'true') {
    // Locator.click scrolls sticky controls out of scroll-padding before dispatching; a user clicks the visible header directly.
    const box = (await trigger.boundingBox())!
    const viewport = page.viewportSize()
    if (box.y >= 0 && viewport !== null && box.y + box.height <= viewport.height) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    else await trigger.click()
  }
  return page.getByRole('list', { name: 'Więcej', exact: true }).filter({ visible: true })
}

export async function changeTheme(page: Page, name: string | RegExp) {
  const menu = await openPageOptions(page)
  await menu.getByRole('button', { name }).click()
  await page.keyboard.press('Escape')
}
