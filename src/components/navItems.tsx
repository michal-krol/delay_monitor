import Link from 'next/link'
import { HomeIcon, ListIcon, RouteIcon, MapIcon } from './icons'

export type ActiveItem = 'pulpit' | 'odjazdy' | 'trasy' | 'mapa'

type NavItem = { key: ActiveItem; href: string; label: string; icon: typeof HomeIcon }

/**
 * „Odjazdy / Przyjazdy" prowadzi na `/city`, „Trasy" na `/lines`, „Mapa" na
 * `/map` — wszystkie trzy dobierają domyślne miasto (ostatnie z
 * `useCityContext` albo to z największą liczbą stacji kolejowych) i
 * przekierowują. Przełącznik miasta jest w treści tamtych ekranów, nie
 * w menu. Współdzielone przez `Sidebar` (desktop) i `MobileNav` (szuflada) —
 * jedno źródło pozycji.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: 'pulpit', href: '/', label: 'Pulpit', icon: HomeIcon },
  { key: 'odjazdy', href: '/city', label: 'Odjazdy / Przyjazdy', icon: ListIcon },
  { key: 'trasy', href: '/lines', label: 'Trasy', icon: RouteIcon },
  { key: 'mapa', href: '/map', label: 'Mapa', icon: MapIcon },
]

/**
 * Pozycja menu odpowiadająca adresowi. Tylko cztery trasy mają odpowiednik w menu;
 * strony bez niego (np. `/station/[stationId]`, `/connection/...`) → `undefined`.
 */
export function activeItemFromPath(pathname: string): ActiveItem | undefined {
  if (pathname === '/') return 'pulpit'
  if (pathname === '/map' || /^\/city\/[^/]+\/map$/.test(pathname)) return 'mapa'
  if (pathname === '/lines' || /^\/city\/[^/]+\/lines?/.test(pathname)) return 'trasy'
  if (pathname === '/city' || pathname.startsWith('/city/')) return 'odjazdy'
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
      })}
    </nav>
  )
}
