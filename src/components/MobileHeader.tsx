'use client'

import Link from 'next/link'
import { AppLogo, ICON_SIZE, SearchIcon } from './icons'
import { IconButton } from './IconButton'
import { ThemeToggle } from './ThemeToggle'

/**
 * Cienki nagłówek telefonu (poniżej `sm`): logo, wyszukiwarka, motyw. Nawigacja jest w dolnym
 * pasku (`BottomNav`). Wysokość = `--header-h` (z uwzględnieniem wcięcia u góry ekranu).
 */
export function MobileHeader({ onSearch }: { onSearch: () => void }) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b px-4 backdrop-blur-md sm:hidden"
      style={{
        height: 'var(--header-h)',
        paddingTop: 'env(safe-area-inset-top)',
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2.5">
        <AppLogo size={28} />
        <span className="font-heading truncate text-[15px] font-bold">Monitor opóźnień</span>
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
