import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// PWA bez service workera: manifest + ikony wystarczą do instalowalności (ADR / PR2 mobile-shell).
test('manifest: 200, display standalone, ikony PNG odpowiadają 200', async ({ page, request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.status()).toBe(200)
  const manifest = await response.json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.length).toBeGreaterThan(0)

  for (const icon of manifest.icons as { src: string }[]) {
    const iconResponse = await request.get(icon.src)
    expect(iconResponse.status(), icon.src).toBe(200)
    expect(iconResponse.headers()['content-type'], icon.src).toContain('image/png')
  }

  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/)
})

test('strona główna nie zgłasza błędów CSP w konsoli', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /content security policy|refused to/i.test(msg.text())) errors.push(msg.text())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

test('offline: baner „Brak połączenia" nad dolnym paskiem, bez naruszeń axe w jasnym i ciemnym, znika po powrocie sieci', async ({ page, context }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')

  await context.setOffline(true)
  // Region `status` jest zawsze w DOM (pusty online) i ma zerowy rozmiar — widoczna jest pastylka w środku.
  const banner = page.getByRole('status').getByText('Brak połączenia')
  await expect(banner).toBeVisible()

  if (testInfo.project.name !== 'desktop-chromium') {
    const bannerBox = await banner.boundingBox()
    const navBox = await page.getByRole('navigation', { name: 'Nawigacja główna' }).boundingBox()
    expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(navBox!.y)
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(blocking, `${colorScheme}: ${blocking.map((v) => `${v.id}: ${v.help}`).join('\n')}`).toEqual([])
  }

  await context.setOffline(false)
  await expect(banner).toHaveCount(0)
})
