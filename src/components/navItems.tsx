import Link from 'next/link'
import { NAV_TAB_TYPES } from '@/lib/navTransition'
import { HomeIcon, DeparturesBoardIcon, RouteIcon, MapIcon, SearchIcon } from './icons'

export type ActiveItem = 'start' | 'odjazdy' | 'linie' | 'mapa'
export type MobileActiveItem = 'start' | 'map' | 'search' | 'lines'

type NavItem = {
  key: ActiveItem
  href: string
  label: string
  icon: typeof HomeIcon
}

/**
 * „Odjazdy / Przyjazdy" prowadzi na `/city`, „Linie" na `/lines`, „Mapa" na
 * `/map` — wszystkie trzy dobierają domyślne miasto (ostatnie z
 * `useCityContext` albo to z największą liczbą stacji kolejowych) i
 * przekierowują. Przełącznik miasta jest w treści tamtych ekranów, nie
 * w menu. Współdzielone przez `Sidebar` (desktop) i `BottomNav` (telefon) —
 * jedno źródło pozycji.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: 'start', href: '/', label: 'Start', icon: HomeIcon },
  { key: 'odjazdy', href: '/city', label: 'Odjazdy / Przyjazdy', icon: DeparturesBoardIcon },
  { key: 'linie', href: '/lines', label: 'Linie', icon: RouteIcon },
  { key: 'mapa', href: '/map', label: 'Mapa', icon: MapIcon },
]

type MobileNavItem = {
  key: MobileActiveItem
  href: string
  label: string
  icon: typeof HomeIcon
  /** `action` = przycisk wołający `onSearch` (nie nawigacja); `href` to docelowa trasa `/search` (PR 2). */
  kind: 'link' | 'action'
}

/**
 * Dolny pasek telefonu (ADR 0010): Start, Mapa, Szukaj, Linie — inny zestaw niż `NAV_ITEMS`
 * (Odjazdy są na Starcie i w wyszukiwarce). „Szukaj" to akcja, nie zakładka.
 */
export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { key: 'start', href: '/', label: 'Start', icon: HomeIcon, kind: 'link' },
  { key: 'map', href: '/map', label: 'Mapa', icon: MapIcon, kind: 'link' },
  { key: 'search', href: '/search', label: 'Szukaj', icon: SearchIcon, kind: 'action' },
  { key: 'lines', href: '/lines', label: 'Linie', icon: RouteIcon, kind: 'link' },
]

// Jedno miejsce na wzorce tras — używają ich obie funkcje poniżej.
const isMapPath = (pathname: string) => pathname === '/map' || /^\/city\/[^/]+\/map$/.test(pathname)
const isLinesPath = (pathname: string) => pathname === '/lines' || /^\/city\/[^/]+\/lines?/.test(pathname)

/**
 * Pozycja menu odpowiadająca adresowi. Tylko cztery trasy mają odpowiednik w menu;
 * strony bez niego (np. `/station/[stationId]`, `/connection/...`) → `undefined`.
 */
export function activeItemFromPath(pathname: string): ActiveItem | undefined {
  if (pathname === '/') return 'start'
  if (isMapPath(pathname)) return 'mapa'
  if (isLinesPath(pathname)) return 'linie'
  if (pathname === '/city' || pathname.startsWith('/city/')) return 'odjazdy'
  return undefined
}

/**
 * Zakładka dolnego paska telefonu dla adresu. Tablice, połączenia, przystanki i miasto to
 * „Start" (tam się do nich wchodzi); `/search` jest rozpoznawane już teraz, trasa dojdzie w PR 2.
 */
export function mobileActiveItemFromPath(pathname: string): MobileActiveItem | undefined {
  if (pathname === '/search') return 'search'
  if (isMapPath(pathname)) return 'map'
  if (isLinesPath(pathname)) return 'lines'
  if (pathname === '/' || pathname === '/city' || /^\/(city|station|connection)\//.test(pathname)) return 'start'
  return undefined
}

/** Lista pozycji paska bocznego (desktop). `collapsed` chowa etykiety. */
export function NavList({ activeItem, collapsed = false }: { activeItem?: ActiveItem; collapsed?: boolean }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = item.key === activeItem
        return (
          <Link
            key={item.key}
            href={item.href}
            transitionTypes={NAV_TAB_TYPES}
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
