'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { THEME_BG } from '@/lib/siteMeta'

/**
 * Kolor paska przeglądarki za motywem wybranym w aplikacji, nie tylko systemowym. `viewport.themeColor`
 * (layout.tsx) daje dwie metki `theme-color` z `media: prefers-color-scheme`, a `ThemeToggle` przełącza
 * klasę `.dark` — przy wymuszonym ciemnym na jasnym systemie pasek zostawał jasny. Po rozwiązaniu motywu
 * wpisujemy jego `--bg-base` do obu metek. Tylko efekt i `null` w renderze — nic do hydratacji.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = THEME_BG[resolvedTheme]
    }
  }, [resolvedTheme])

  return null
}
