import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** Skończone animacje dokumentu (bez nieskończonych — puls kropki, szkielety — i przypiętych do przewijania). */
const FINITE_ANIMATIONS = `document.getAnimations().filter((animation) => animation.timeline instanceof DocumentTimeline && animation.effect?.getComputedTiming().iterations !== Infinity)`

const settle = (page: Page): Promise<unknown> =>
  page.evaluate(`Promise.all(${FINITE_ANIMATIONS}.map((animation) => animation.finished.catch(() => undefined)))`)

/**
 * axe (WCAG 2 A/AA) po tym, jak skończą się skończone animacje: wiersze tablicy wsuwają się przez 160 ms
 * (`useRowAnimation`), a kontrast liczony w połowie wejścia (przezroczystość) fałszywie alarmuje. Snapshot pollera
 * potrafi dojść W TRAKCIE skanu (wiersze zaczynają wejście po tym, jak animacje już „skończyły się”), więc skan,
 * w którego trakcie ruszyła jakaś animacja, powtarzamy (do 3 razy) po jej zakończeniu.
 */
export async function scanA11y(page: Page): ReturnType<AxeBuilder['analyze']> {
  let results = await settle(page).then(() => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
  for (let attempt = 0; attempt < 3; attempt++) {
    const running = (await page.evaluate(`${FINITE_ANIMATIONS}.length`)) as number
    if (running === 0) break
    await settle(page)
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  }
  return results
}
