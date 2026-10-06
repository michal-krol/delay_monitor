'use client'

import Link from 'next/link'
import { AppLogo, ICON_SIZE, SearchIcon } from './icons'
import { IconButton } from './IconButton'
import { ThemeToggle } from './ThemeToggle'
import { useContextTitle } from './headerTitle'

/**
 * Cienki nagłówek telefonu (poniżej `sm`): logo, wyszukiwarka, motyw. Nawigacja jest w dolnym
 * pasku (`BottomNav`). Wysokość = `--header-h` (z uwzględnieniem wcięcia u góry ekranu).
 */
export function MobileHeader({ onSearch }: { onSearch: () => void }) {
  const contextTitle = useContextTitle()
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-2 glass-chrome border-b px-4 sm:hidden"
      style={{
        height: 'var(--header-h)',
        // Kotwica: pasek stoi w miejscu podczas przesunięcia treści (`globals.css`, „View transitions”).
        viewTransitionName: 'site-header',
        paddingTop: 'env(safe-area-inset-top)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2.5">
        <AppLogo size={28} />
        {/* Nazwa aplikacji i (przy tablicy) nazwa tablicy w jednej komórce siatki: przy przewijaniu jedna płynnie
            ustępuje drugiej (CSS scroll-driven, `globals.css`), bez zmiany układu. Kopia nazwy tablicy jest
            `aria-hidden` — nazwę niesie `h1` strony. */}
        <span className="header-titles grid min-w-0" data-context={contextTitle !== null ? '' : undefined}>
          <span data-testid="header-app-title" className="header-title-app font-heading truncate text-[15px] font-bold [grid-area:1/1]">Monitor opóźnień</span>
          {contextTitle !== null && (
            <span aria-hidden="true" data-testid="header-context-title" className="header-title-context font-heading truncate text-[15px] font-bold [grid-area:1/1]">
              {contextTitle}
            </span>
          )}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <IconButton label="Szukaj" onClick={onSearch}>
          <SearchIcon size={ICON_SIZE.button} />
        </IconButton>
        <ThemeToggle />
      </div>
    </header>
  )
}
