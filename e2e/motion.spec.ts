import { test, expect, type Page } from '@playwright/test'
import { scanA11y } from './helpers/axe'
import { showBoardContext } from './helpers/info'

// PR6: przejścia widoku, ruch i szkło. Sprawdzamy w prawdziwym Chromium (WebKit w Playwright nie ma
// `startViewTransition` w tej wersji, a `animation-timeline` dochodzi dopiero w Safari 26).
const READY = 45_000
const STATION = '/station/33605?name=Warszawa%20Centralna'
const PINNED = [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]

type Recorded = { types: string[]; pseudo?: string[] }

const SAFARI_GATE = 'mobile-safari: document.startViewTransition is undefined'

test.beforeEach(async ({ page, browserName }) => {
  if (test.info().title === SAFARI_GATE) return // jedyny test tego pliku dla WebKit: bez rejestratora przejść
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

async function expectNoBlockingViolations(page: Page): Promise<void> {
  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help} ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')).toEqual([])
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
    const card = page.getByRole('article').getByRole('heading', { name: 'Warszawa Centralna' }).getByRole('link')
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
    await page.getByRole('link', { name: 'Wróć do Startu' }).click()
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: READY })
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

test(SAFARI_GATE, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-safari', 'bramka silnika: tylko WebKit (iPhone)')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: READY })
  await page.waitForLoadState('networkidle')
  // Bramka (`viewTransitionGate.ts`) siedzi w AppChrome; po hydracji API ma być niewidoczne dla Reacta.
  expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('undefined')
})

test('shell stays put during navigation (header and bottom nav keep their boxes, no transform)', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 640, 'dolny pasek i nagłówek telefonu')
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' })
  await expect(nav).toBeVisible({ timeout: READY })
  await page.waitForLoadState('networkidle')
  // Próbkujemy co klatkę od przed kliknięciem do chwili po zakończeniu przejścia: wszystkie próbki muszą być równe.
  await page.evaluate(() => {
    const samples = new Set<string>()
    const w = window as unknown as { __shell: Set<string>; __shellStop: boolean }
    w.__shell = samples
    w.__shellStop = false
    const box = (element: Element | null) => {
      if (element === null) return 'missing'
      const r = element.getBoundingClientRect()
      return [r.x, r.y, r.width, r.height, getComputedStyle(element).transform].join()
    }
    const tick = () => {
      samples.add(`${box(document.querySelector('header'))}|${box(document.querySelector('nav[aria-label="Nawigacja główna"]'))}`)
      if (!w.__shellStop) requestAnimationFrame(tick)
    }
    tick()
  })
  await nav.getByRole('link', { name: 'Linie' }).click()
  await expect(page).toHaveURL(/\/lines/, { timeout: READY })
  await expect(page.getByTestId('line-section').first()).toBeVisible({ timeout: READY })
  await page.waitForTimeout(600)
  const samples = await page.evaluate(() => {
    const w = window as unknown as { __shell: Set<string>; __shellStop: boolean }
    w.__shellStop = true
    return [...w.__shell]
  })
  expect(samples).toHaveLength(1)
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('navigation and tab switch start no view transition at all', async ({ page }) => {
    await page.goto('/')
    const card = page.getByRole('article').getByRole('heading', { name: 'Warszawa Centralna' }).getByRole('link')
    await expect(card).toBeVisible({ timeout: READY })
    await page.waitForTimeout(500)
    await card.click()
    await expect(page.getByRole('tab', { name: 'Przyjazdy' })).toBeVisible({ timeout: READY })
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: 'Przyjazdy' }).click()
    await expect(page.getByRole('tab', { name: 'Przyjazdy' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('link', { name: 'Wróć do Startu' }).click()
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: READY })
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
  test('the live dot pulses once while the data is fresh', async ({ page }) => {
    await stationReady(page)
    const dot = page.getByTestId('live-dot').first()
    await expect(dot).toBeAttached({ timeout: READY })
    // Nazwa i liczba iteracji to właściwości obliczone, niezależne od tego, czy puls już się skończył.
    const style = await dot.evaluate((element) => {
      const computed = getComputedStyle(element)
      return { name: computed.animationName, iterations: computed.animationIterationCount }
    })
    expect(style).toEqual({ name: 'livePulse', iterations: '1' })
  })

  test('reduced motion toggled mid-session removes the live-dot animation', async ({ page }) => {
    await stationReady(page)
    const dot = page.getByTestId('live-dot').first()
    await expect(dot).toBeAttached({ timeout: READY })
    const animationName = () => dot.evaluate((element) => getComputedStyle(element).animationName)
    expect(await animationName()).toBe('livePulse')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(animationName).toBe('none')
    // Media query działa na żywo, bez przeładowania: powrót preferencji przywraca puls.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect.poll(animationName).toBe('livePulse')
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
      await expectNoBlockingViolations(page)
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
      await expectNoBlockingViolations(page)
    })
  }
})
