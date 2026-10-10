'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_TAB_TYPES } from '@/lib/navTransition'
import { ICON_SIZE } from './icons'
import { MOBILE_NAV_ITEMS, mobileActiveItemFromPath } from './navItems'

// Wspólny wygląd linku i przycisku „Szukaj": aktywny stan niesie pastylka (`.nav-pill` przy `data-active`),
// kolor i grubość napisu — grubszy napis to cue nie tylko kolorem.
const TARGET_CLASS =
  'press flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium text-text-secondary transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none focus-visible:ring-inset'

/**
 * Dolny pasek telefonu (poniżej `sm`; od `sm` jest pasek boczny): Start, Mapa, Szukaj, Linie (ADR 0010).
 * Start/Mapa/Linie to linki, „Szukaj" to przycisk otwierający wspólne okno wyszukiwania (`onSearch` z `AppChrome`).
 * Wysokość celu = `--bottom-nav-h` bez strefy bezpieczeństwa; ta dochodzi paddingiem,
 * a treść strony rezerwuje całość w `(app)/layout.tsx`.
 */
export function BottomNav({ onSearch }: { onSearch: () => void }) {
  const activeItem = mobileActiveItemFromPath(usePathname())

  return (
    <nav
      aria-label="Nawigacja główna"
      className="fixed inset-x-0 bottom-0 z-30 glass-chrome border-t sm:hidden"
      style={{
        borderColor: 'var(--sidebar-border)',
        viewTransitionName: 'site-bottom-nav',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingInline: 'env(safe-area-inset-left) env(safe-area-inset-right)',
      }}
    >
      <ul className="grid grid-cols-4">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = item.key === activeItem
          const common = {
            'aria-current': isActive ? ('page' as const) : undefined,
            'data-active': isActive || undefined,
            className: TARGET_CLASS,
            style: isActive ? { color: 'var(--nav-active-text)', fontWeight: 600 } : undefined,
          }
          const content = (
            <>
              <span className="nav-pill">
                <Icon size={ICON_SIZE.tile} />
              </span>
              <span>{item.label}</span>
            </>
          )
          return (
            <li key={item.key}>
              {item.kind === 'action' ? (
                <button type="button" onClick={onSearch} {...common}>
                  {content}
                </button>
              ) : (
                <Link href={item.href} transitionTypes={NAV_TAB_TYPES} {...common}>
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
