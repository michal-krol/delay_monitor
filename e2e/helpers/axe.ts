import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** Skończone animacje dokumentu (bez nieskończonych — puls kropki, szkielety — i przypiętych do przewijania). */
const FINITE_ANIMATIONS = `document.getAnimations().filter((animation) => animation.timeline instanceof DocumentTimeline && animation.effect?.getComputedTiming().iterations !== Infinity)`

const settle = (page: Page): Promise<unknown> =>
  page.evaluate(`Promise.all(${FINITE_ANIMATIONS}.map((animation) => animation.finished.catch(() => undefined)))`)

/**
 * Licznik animacji, które RUSZYŁY (WAAPI: `animate()`, `Animation#play()` — tak startuje `useRowAnimation`; CSS:
 * `animationstart`/`transitionstart`). Instalowany raz na dokument; zwraca bieżącą wartość.
 */
const ANIMATION_STARTS = `(() => {
  if (window.__axeAnimationStarts === undefined) {
    window.__axeAnimationStarts = 0
    const bump = () => { window.__axeAnimationStarts++ }
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) { bump(); return animate.apply(this, args) }
    const play = Animation.prototype.play
    Animation.prototype.play = function (...args) { bump(); return play.apply(this, args) }
    document.addEventListener('animationstart', bump, true)
    document.addEventListener('transitionstart', bump, true)
  }
  return window.__axeAnimationStarts
})()`

const animationStarts = (page: Page): Promise<number> => page.evaluate(ANIMATION_STARTS) as Promise<number>

/**
 * axe (WCAG 2 A/AA) po tym, jak skończą się skończone animacje: wiersze tablicy wsuwają się przez 160 ms
 * (`useRowAnimation`), a kontrast liczony w połowie wejścia (przezroczystość) fałszywie alarmuje. Snapshot pollera
 * potrafi dojść W TRAKCIE skanu (tablica gotowa po ~0,7 s, pierwsze wiersze z drabinki 1/2/4 s), a wejście kończy
 * się, zanim skan wróci — sprawdzenie „czy coś jeszcze się animuje” po skanie tego nie widzi. Dlatego liczymy
 * animacje, które RUSZYŁY w trakcie skanu; skan, w którego trakcie ruszyła jakaś animacja, powtarzamy (do 3 razy)
 * po jej zakończeniu.
 */
export async function scanA11y(page: Page): ReturnType<AxeBuilder['analyze']> {
  const scan = async (): Promise<{ results: Awaited<ReturnType<AxeBuilder['analyze']>>; moved: boolean }> => {
    // Licznik PRZED `settle`: animacja, która ruszy między nimi, i tak zostanie policzona.
    const before = await animationStarts(page)
    await settle(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const running = (await page.evaluate(`${FINITE_ANIMATIONS}.length`)) as number
    return { results, moved: running > 0 || (await animationStarts(page)) !== before }
  }
  let { results, moved } = await scan()
  for (let attempt = 0; attempt < 3 && moved; attempt++) ({ results, moved } = await scan())
  return results
}
