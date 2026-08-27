'use client'

import { useEffect, useState } from 'react'
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
  // next-themes rozwiązuje prawdziwy motyw synchronicznie już przy
  // pierwszym renderze klienta (żeby uniknąć błysku złego motywu), ale
  // serwer nigdy nie ma dostępu do localStorage/prefers-color-scheme --
  // resolvedTheme jest tam zawsze `undefined`. Czytanie resolvedTheme wprost
  // (bez tej strażniczej flagi) dawało więc dwa różne renderowania tego
  // samego przycisku (ikona + aria-label) między serwerem a klientem --
  // "Hydration failed" zaobserwowane na żywo w konsoli produkcyjnej.
  // `mounted` trzyma pierwszy render klienta identycznym z serwerowym z
  // definicji, dopóki useEffect (który na serwerze się nie odpala) nie
  // potwierdzi, że jesteśmy faktycznie po stronie klienta.
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  // eslint-disable-next-line react-hooks/set-state-in-effect -- czy jesteśmy po stronie klienta jest wiadome dopiero po zamontowaniu, ten sam wzorzec co odtwarzanie stanu z URL-a w FullBoard.tsx
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'

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
