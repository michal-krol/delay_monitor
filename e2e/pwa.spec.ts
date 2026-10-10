import { test, expect } from '@playwright/test'
import { scanA11y } from './helpers/axe'

// PWA bez service workera: manifest + ikony wystarczą do instalowalności (ADR / PR2 mobile-shell).
test('manifest: 200, display standalone, ikony PNG odpowiadają 200', async ({ page, request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.status()).toBe(200)
  const manifest = await response.json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.length).toBeGreaterThan(0)
  const maskable = (manifest.icons as { src: string; purpose?: string }[]).filter((icon) => icon.purpose === 'maskable')
  expect(maskable.map((icon) => icon.src)).toEqual(['/icon/maskable-192', '/icon/maskable-512'])

  for (const icon of manifest.icons as { src: string }[]) {
    const iconResponse = await request.get(icon.src)
    expect(iconResponse.status(), icon.src).toBe(200)
    expect(iconResponse.headers()['content-type'], icon.src).toContain('image/png')
  }

  const shortcuts = manifest.shortcuts as { name: string; icons?: { src: string; sizes: string }[] }[]
  expect(shortcuts.map((s) => s.name)).toEqual(['Start', 'Odjazdy', 'Mapa', 'Linie'])
  const shortcutSrcs = shortcuts.map((s) => s.icons?.[0]?.src)
  expect(new Set(shortcutSrcs).size, 'każdy skrót ma własną ikonę').toBe(shortcuts.length)
  for (const shortcut of shortcuts) {
    expect(shortcut.icons?.[0]?.sizes, shortcut.name).toBe('192x192')
    const src = shortcut.icons![0].src
    const iconResponse = await request.get(src)
    expect(iconResponse.status(), src).toBe(200)
    expect(iconResponse.headers()['content-type'], src).toContain('image/png')
  }

  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/)
})

test('theme-color idzie za ręcznie wybranym motywem, nie tylko za systemowym', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const themeColors = page.locator('meta[name="theme-color"]')
  await expect(themeColors).toHaveCount(2)

  // Na telefonie i komputerze przełącznik jest w innym nagłówku — klikamy widoczny.
  await page.getByRole('button', { name: 'Przełącz na tryb ciemny' }).filter({ visible: true }).click()
  for (const meta of await themeColors.all()) await expect(meta).toHaveAttribute('content', '#070b14')

  await page.getByRole('button', { name: 'Przełącz na tryb jasny' }).filter({ visible: true }).click()
  for (const meta of await themeColors.all()) await expect(meta).toHaveAttribute('content', '#eef0f8')
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
    const { violations } = await scanA11y(page)
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(blocking, `${colorScheme}: ${blocking.map((v) => `${v.id}: ${v.help}`).join('\n')}`).toEqual([])
  }

  await context.setOffline(false)
  await expect(banner).toHaveCount(0)
})

test('manifest: kategorie, skróty z ikonami i zrzuty do okna instalacji odpowiadają 200', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest.categories).toEqual(['travel', 'transportation'])
  expect((manifest.shortcuts as { name: string; url: string }[]).map((s) => `${s.name} ${s.url}`)).toEqual(['Start /', 'Odjazdy /city', 'Mapa /map', 'Linie /lines'])
  const shots = manifest.screenshots as { src: string; form_factor: string }[]
  expect(shots.filter((s) => s.form_factor === 'narrow').length).toBeGreaterThanOrEqual(2)
  expect(shots.filter((s) => s.form_factor === 'wide').length).toBeGreaterThanOrEqual(1)
  for (const src of [...shots.map((s) => s.src), ...manifest.shortcuts.flatMap((s: { icons: { src: string }[] }) => s.icons.map((i) => i.src))]) {
    const response = await request.get(src)
    expect(response.status(), src).toBe(200)
    expect(response.headers()['content-type'], src).toContain('image/png')
  }
})

test('iOS: metki trybu aplikacji (tytuł, pasek stanu) są w <head>', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Opóźnienia')
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent')
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
})

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

test.describe('podpowiedź instalacji', () => {
  test.describe('iOS', () => {
    test.use({ userAgent: IOS_UA })

    test('pokazuje „Udostępnij → Do ekranu początkowego" nad dolnym paskiem, zamknięcie zostaje po przeładowaniu', async ({ page }, testInfo) => {
      await page.goto('/')
      const prompt = page.getByTestId('install-prompt')
      await expect(prompt.getByText('Udostępnij → Do ekranu początkowego')).toBeVisible()

      if (testInfo.project.name !== 'desktop-chromium') {
        const promptBox = await prompt.boundingBox()
        const navBox = await page.getByRole('navigation', { name: 'Nawigacja główna' }).boundingBox()
        expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(navBox!.y)
      }

      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        const { violations } = await scanA11y(page)
        const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(blocking, `${colorScheme}: ${blocking.map((v) => `${v.id}: ${v.help}`).join('\n')}`).toEqual([])
      }

      await prompt.getByRole('button', { name: 'Zamknij podpowiedź instalacji' }).click()
      await expect(prompt).toHaveCount(0)
      await page.reload()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    })
  })

  test('Chromium: przycisk „Zainstaluj aplikację" po beforeinstallprompt, brak podpowiedzi bez zdarzenia', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-safari', 'WebKit nie wysyła beforeinstallprompt, a platforma „iPhone" włącza wariant iOS')
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })))
    await expect(page.getByRole('button', { name: 'Zainstaluj aplikację' })).toBeVisible()
    const { violations } = await scanA11y(page)
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  })
})
