import Link from 'next/link'
import { HomeIcon, ListIcon, StarIcon, BellIcon, RouteIcon, MapIcon, SettingsIcon } from './icons'

export type ActiveItem = 'pulpit' | 'odjazdy' | 'trasy'

type NavItem =
  | { kind: 'active'; key: ActiveItem; href: string; label: string; icon: typeof HomeIcon }
  | { kind: 'disabled'; label: string; icon: typeof HomeIcon; title?: string }

/**
 * „Odjazdy / Przyjazdy" prowadzi na `/miasto`, „Trasy" na `/linie` — obie trasy
 * dobierają domyślne miasto (ostatnie z `useCityContext` albo to z największą
 * liczbą stacji kolejowych) i przekierowują. Przełącznik miasta jest w treści
 * tamtych ekranów, nie w menu. Współdzielone przez `Sidebar` (desktop) i
 * `MobileNav` (szuflada) — jedno źródło pozycji.
 */
export const NAV_ITEMS: NavItem[] = [
  { kind: 'active', key: 'pulpit', href: '/', label: 'Pulpit', icon: HomeIcon },
  { kind: 'active', key: 'odjazdy', href: '/miasto', label: 'Odjazdy / Przyjazdy', icon: ListIcon },
  { kind: 'active', key: 'trasy', href: '/linie', label: 'Trasy', icon: RouteIcon },
  { kind: 'disabled', label: 'Ulubione', icon: StarIcon },
  { kind: 'disabled', label: 'Powiadomienia', icon: BellIcon },
  { kind: 'disabled', label: 'Mapa', icon: MapIcon },
  { kind: 'disabled', label: 'Ustawienia', icon: SettingsIcon },
]

/**
 * Pozycja menu odpowiadająca adresowi. Tylko trzy trasy mają odpowiednik w menu;
 * strony bez niego (np. `/odjazdy/[stationId]`, `/polaczenie/...`) → `undefined`.
 */
export function activeItemFromPath(pathname: string): ActiveItem | undefined {
  if (pathname === '/') return 'pulpit'
  if (pathname === '/linie' || /^\/miasto\/[^/]+\/lini[ae]/.test(pathname)) return 'trasy'
  if (pathname === '/miasto' || pathname.startsWith('/miasto/')) return 'odjazdy'
  return undefined
}

/**
 * Lista pozycji nawigacji. `collapsed` (tylko desktop) chowa etykiety;
 * `onNavigate` (tylko szuflada) zamyka ją po tapnięciu w link.
 */
export function NavList({
  activeItem,
  collapsed = false,
  onNavigate,
}: {
  activeItem?: ActiveItem
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        if (item.kind === 'active') {
          const isActive = item.key === activeItem
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium text-text-secondary transition"
              style={
                isActive
                  ? { background: 'var(--nav-active-bg)', color: 'var(--nav-active-text)', fontWeight: 600 }
                  : undefined
              }
            >
              <Icon />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        }
        return (
          <div
            key={item.label}
            aria-disabled="true"
            aria-label={item.label}
            title={item.title ?? 'Wkrótce'}
            className="flex cursor-not-allowed items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-sm text-text-muted opacity-50"
          >
            <div className="flex items-center gap-3">
              <Icon />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </div>
          </div>
        )
      })}
    </nav>
  )
}
