'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_TAB_TYPES } from '@/lib/navTransition'
import { ICON_SIZE } from './icons'
import { activeItemFromPath, NAV_ITEMS } from './navItems'

/**
 * Dolny pasek zakładek na telefonie (poniżej `sm`; od `sm` jest pasek boczny).
 * Wysokość linku = `--bottom-nav-h` bez strefy bezpieczeństwa; ta dochodzi paddingiem,
 * a treść strony rezerwuje całość w `(app)/layout.tsx`.
 */
export function BottomNav() {
  const activeItem = activeItemFromPath(usePathname())

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
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = item.key === activeItem
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                transitionTypes={NAV_TAB_TYPES}
                aria-current={isActive ? 'page' : undefined}
                data-active={isActive || undefined}
                className="press flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-text-secondary transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none focus-visible:ring-inset"
                style={
                  isActive
                    ? { background: 'var(--nav-active-bg)', color: 'var(--nav-active-text)', fontWeight: 600 }
                    : undefined
                }
              >
                <span className="nav-pill">
                  <Icon size={ICON_SIZE.tile} />
                </span>
                <span>{item.shortLabel}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
