import { expect, type Locator, type Page } from '@playwright/test'

/** Native input avoids scrollIntoView moving an already visible sticky header before the click. */
async function clickHeaderControl(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible()
  const box = (await control.boundingBox())!
  const viewport = page.viewportSize()
  if (box.y >= 0 && viewport !== null && box.y + box.height <= viewport.height) {
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    expect(await control.evaluate((element, at) => element.contains(document.elementFromPoint(at.x, at.y)), point)).toBe(true)
    await page.mouse.click(point.x, point.y)
  } else await control.click()
}

export async function openPageOptions(page: Page) {
  const trigger = page.getByRole('button', { name: 'Więcej opcji strony', exact: true }).filter({ visible: true })
  await expect(trigger).toBeVisible()
  if (await trigger.getAttribute('aria-expanded') !== 'true') {
    await clickHeaderControl(page, trigger)
  }
  return page.getByRole('list', { name: 'Więcej', exact: true }).filter({ visible: true })
}

export async function changeTheme(page: Page, name: string | RegExp) {
  const menu = await openPageOptions(page)
  await clickHeaderControl(page, menu.getByRole('button', { name }))
  await page.keyboard.press('Escape')
}
