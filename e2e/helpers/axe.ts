import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/**
 * axe (WCAG 2 A/AA) po tym, jak skończą się skończone animacje: wiersze tablicy wsuwają się przez 160 ms
 * (`useRowAnimation`), a kontrast liczony w połowie wejścia (przezroczystość) fałszywie alarmuje. Animacje
 * nieskończone (puls kropki, szkielety) i przypięte do przewijania (tytuł nagłówka) pomijamy — nigdy się nie kończą.
 */
export async function scanA11y(page: Page): ReturnType<AxeBuilder['analyze']> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.timeline instanceof DocumentTimeline && animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    )
  )
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
}
