'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/**
 * next-themes zna `resolvedTheme` dopiero po hydratacji (musi odczytać
 * localStorage/media query w przeglądarce) — bez guardu `mounted` pierwszy
 * render po stronie klienta różniłby się od SSR.
 *
 * Renderowany raz w layout.tsx jako `fixed` przycisk w rogu ekranu — nie
 * przy `AppTitle`, żeby był widoczny niezależnie od stanu strony (dashboard,
 * pusty stan, pełna tablica) bez duplikowania go w każdym z nich.
 */
const POSITION_CLASSES = 'fixed right-4 top-4 z-50'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time SSR/client hydration guard, not a state sync
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className={`${POSITION_CLASSES} grid h-9 w-9 place-items-center rounded-full bg-white/60 ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10`}
      />
    )
  }

  const isDark = resolvedTheme === 'dark'
  const label = isDark ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={`${POSITION_CLASSES} grid h-9 w-9 place-items-center rounded-full bg-white/60 text-gray-600 ring-1 ring-black/10 transition hover:bg-white/90 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/15 dark:hover:text-gray-100`}
    >
      {isDark ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4l-1.1-1.1" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">
          <path d="M13.4 9.5A6 6 0 1 1 6.5 2.6a5 5 0 0 0 6.9 6.9Z" />
        </svg>
      )}
    </button>
  )
}
