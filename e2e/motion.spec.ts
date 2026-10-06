import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { showBoardContext } from './helpers/info'

// PR6: przejścia widoku, ruch i szkło. Sprawdzamy w prawdziwym Chromium (WebKit w Playwright nie ma
// `startViewTransition` w tej wersji, a `animation-timeline` dochodzi dopiero w Safari 26).
const READY = 45_000
const STATION = '/station/33605?name=Warszawa%20Centralna'
const PINNED = [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]

type Recorded = { types: string[]; pseudo?: string[] }

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'View Transitions i scroll-driven animations: tylko Chromium')
  await page.addInitScript((pinned) => {
    window.localStorage.setItem('monitor.favourites.v2', JSON.stringify(pinned))
    const log: { types: string[]; pseudo?: string[] }[] = []
    ;(window as unknown as { __vt: typeof log }).__vt = log
    const original = document.startViewTransition?.bind(document)
    if (original === undefined) return
    document.startViewTransition = ((arg?: unknown) => {
      const transition = original(arg as never)
      const entry: { types: string[]; pseudo?: string[] } = { types: [...(transition.types ?? [])] }
      log.push(entry)
      void transition.ready.then(
        () => {
          entry.pseudo = document
            .getAnimations()
            .map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement ?? '')
            .filter((name) => name.startsWith('::view-transition'))
        },
        () => {}
      )
      return transition
    }) as typeof document.startViewTransition
  }, PINNED)
})

async function transitions(page: Page): Promise<Recorded[]> {
  return page.evaluate(() => (window as unknown as { __vt: Recorded[] }).__vt.map((entry) => ({ ...entry })))
}

async function resetTransitions(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __vt: Recorded[] }).__vt.length = 0
  })
}

async function stationReady(page: Page): Promise<void> {
  await page.goto(STATION)
  await expect(page.getByRole('tablist', { name: 'Kierunek' })).toBeVisible({ timeout: READY })
  // Hydracja: klik przed nią przepada bez śladu.
  await expect(page.getByRole('tab', { name: 'Odjazdy' })).toHaveAttribute('aria-selected', 'true')
  await page.waitForTimeout(500)
}

test.describe('view transitions (motion allowed)', () => {
  test('Pulpit card → station starts a nav-forward transition and morphs the title', async ({ page }) => {
    await page.goto('/')
    const card = page.getByRole('button', { name: /Pokaż pełną tablicę/ })
    await expect(card).toBeVisible({ timeout: READY })
    await page.waitForTimeout(500)
    await card.click()
    await expect(page.getByRole('heading', { name: 'Warszawa Centralna', level: 1 })).toBeVisible({ timeout: READY })
    await expect.poll(async () => (await transitions(page)).length).toBeGreaterThan(0)
    const [first] = await transitions(page)
    expect(first.types).toEqual(['nav-forward'])
    await expect.poll(async () => (await transitions(page))[0]?.pseudo ?? []).toContain('::view-transition-group(place-pkp-33605)')
  })

  test('the back arrow starts a nav-back transition', async ({ page }) => {
    await stationReady(page)
    await resetTransitions(page)
    await page.getByRole('link', { name: 'Wróć do Pulpitu' }).click()
    await expect(page.getByRole('heading', { name: 'Pulpit' })).toBeVisible({ timeout: READY })
    await expect.poll(async () => (await transitions(page)).map((entry) => entry.types.join())).toContain('nav-back')
  })

  test('switching Odjazdy ↔ Przyjazdy starts exactly one transition', async ({ page }) => {
    await stationReady(page)
    await resetTransitions(page)
    await page.getByRole('tab', { name: 'Przyjazdy' }).click()
    await expect(page.getByRole('tab', { name: 'Przyjazdy' })).toHaveAttribute('aria-selected', 'true')
    await page.waitForTimeout(800)
    const recorded = await transitions(page)
    expect(recorded).toHaveLength(1)
    expect(recorded[0].types).toEqual([])
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('navigation and tab switch start no view transition at all', async ({ page }) => {
    await page.goto('/')
    const card = page.getByRole('button', { name: /Pokaż pełną tablicę/ })
    await expect(card).toBeVisible({ timeout: READY })
    await page.waitForTimeout(500)
    await card.click()
    await expect(page.getByRole('tab', { name: 'Przyjazdy' })).toBeVisible({ timeout: READY })
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: 'Przyjazdy' }).click()
    await expect(page.getByRole('tab', { name: 'Przyjazdy' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('link', { name: 'Wróć do Pulpitu' }).click()
    await expect(page.getByRole('heading', { name: 'Pulpit' })).toBeVisible({ timeout: READY })
    await page.waitForTimeout(500)
    expect(await transitions(page)).toEqual([])
  })

  test('the live dot does not pulse', async ({ page }) => {
    await stationReady(page)
    const dot = page.getByTestId('live-dot').first()
    await expect(dot).toBeAttached({ timeout: READY })
    expect(await dot.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  })

  test('phone: the header keeps the app name, the board name copy stays hidden', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) >= 640, 'nagłówek telefonu')
    // Niski ekran: mock ma kilka wierszy, a przy 839 px strona w ogóle się nie przewija.
    await page.setViewportSize({ width: 375, height: 520 })
    await stationReady(page)
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.waitForTimeout(400)
    const context = page.getByTestId('header-context-title')
    await expect(context).toBeAttached()
    expect(await context.evaluate((element) => getComputedStyle(element).display)).toBe('none')
  })
})

test.describe('motion allowed: live feedback', () => {
  test('the live dot pulses while the data is fresh', async ({ page }) => {
    await stationReady(page)
    const dot = page.getByTestId('live-dot').first()
    await expect(dot).toBeAttached({ timeout: READY })
    expect(await dot.evaluate((element) => getComputedStyle(element).animationName)).toBe('livePulse')
  })

  test('phone: the header swaps the app name for the board name after scrolling', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) >= 640, 'nagłówek telefonu')
    // Niski ekran: mock ma kilka wierszy, a przy 839 px strona w ogóle się nie przewija.
    await page.setViewportSize({ width: 375, height: 520 })
    await stationReady(page)
    const context = page.getByTestId('header-context-title')
    const app = page.getByTestId('header-app-title')
    await expect(context).toBeAttached()
    const opacity = (locator: typeof context) => locator.evaluate((element) => Number(getComputedStyle(element).opacity))
    expect(await opacity(context)).toBeLessThan(0.1)
    expect(await opacity(app)).toBeGreaterThan(0.9)
    await page.evaluate(() => window.scrollTo(0, 400))
    await expect.poll(() => opacity(context)).toBeGreaterThan(0.9)
    expect(await opacity(app)).toBeLessThan(0.1)
  })
})

test.describe('glass surfaces stay accessible', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: board with the Info sheet open on a phone (${theme})`, async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 1280) >= 640, 'arkusz Info jest tylko na telefonie')
      await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
      await stationReady(page)
      await showBoardContext(page)
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help} ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
    })

    test(`axe: search dialog over the board (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
      await stationReady(page)
      await page.keyboard.press('Control+k')
      const dialog = page.getByRole('dialog', { name: /Szukaj stacji/ })
      await expect(async () => {
        if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Szukaj' }).first().click()
        await expect(dialog).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: READY })
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      expect(blocking, blocking.map((v) => `${v.id}: ${v.help} ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
    })
  }
})
