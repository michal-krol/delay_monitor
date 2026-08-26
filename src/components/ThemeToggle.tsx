'use client'

import { useTheme } from 'next-themes'
import { SunIcon, MoonIcon } from './icons'

/**
 * Przełącznik jasny/ciemny jako ikona bez podpisu — przeniesiony z dolnej
 * części Sidebara (gdzie miał etykietę "Tryb ciemny" + osobny suwak) do
 * prawego górnego rogu, obok innych przycisków-ikon (np. `BellIcon` w
 * `TopBar`), na wyraźną prośbę użytkownika. Wydzielony z `Sidebar`, żeby ten
 * sam przycisk dało się osadzić też w `FullBoard` (strona `/odjazdy/[stationId]`
 * nie renderuje `TopBar` i inaczej straciłaby możliwość przełączania motywu).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
      style={{ borderColor: 'var(--surface-border)' }}
    >
      {isDark ? <MoonIcon size={15} /> : <SunIcon size={15} />}
    </button>
  )
}
