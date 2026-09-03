'use client'

import Link from 'next/link'
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed'
import { HomeIcon, ListIcon, StarIcon, BellIcon, RouteIcon, MapIcon, SettingsIcon, ChevronRightIcon } from './icons'
import { PollerDiagnostics } from './PollerDiagnostics'

type ActiveItem = 'pulpit' | 'odjazdy' | 'trasy'

type Props = {
  // Opcjonalny -- jedyny prawdziwy wpis nawigacji to "Pulpit"; reszta jest
  // `kind: 'disabled'` (patrz NAV_ITEMS niżej), więc strony bez odpowiednika
  // w menu (np. /odjazdy/[stationId], /polaczenie/...) nie mają czego podświetlić.
  activeItem?: ActiveItem
}

/**
 * `NEXT_PUBLIC_APP_BRANCH` (patrz `next.config.ts`) niesie surową nazwę gałęzi
 * builda — przydatną deweloperowi, ale "main" nic nie mówi użytkownikowi o tym,
 * że patrzy na produkcję. Etykieta tylko do wyświetlenia, nie zmienia samej
 * zmiennej ani logiki wykrywania gałęzi.
 */
function environmentLabel(branch: string): string {
  if (branch === 'main') return 'prod'
  if (branch === 'dev') return 'dev'
  return branch
}

type NavItem =
  | { kind: 'active'; key: ActiveItem; href: string; label: string; icon: typeof HomeIcon }
  | { kind: 'disabled'; label: string; icon: typeof HomeIcon; badge?: number; title?: string }

/**
 * „Odjazdy / Przyjazdy" prowadzi na `/miasto`, „Trasy" na `/linie` — obie trasy
 * dobierają domyślne miasto (ostatnie z `useCityContext` albo to z największą
 * liczbą stacji kolejowych) i przekierowują. Przełącznik miasta jest w treści
 * tamtych ekranów, nie w menu.
 */
const NAV_ITEMS: NavItem[] = [
  { kind: 'active', key: 'pulpit', href: '/', label: 'Pulpit', icon: HomeIcon },
  { kind: 'active', key: 'odjazdy', href: '/miasto', label: 'Odjazdy / Przyjazdy', icon: ListIcon },
  { kind: 'active', key: 'trasy', href: '/linie', label: 'Trasy', icon: RouteIcon },
  { kind: 'disabled', label: 'Ulubione', icon: StarIcon },
  { kind: 'disabled', label: 'Powiadomienia', icon: BellIcon },
  { kind: 'disabled', label: 'Mapa', icon: MapIcon },
  { kind: 'disabled', label: 'Ustawienia', icon: SettingsIcon },
]

export function Sidebar({ activeItem }: Props) {
  const { collapsed, toggle } = useSidebarCollapsed()

  return (
    <aside
      data-collapsed={collapsed}
      // Poniżej `sm` menu chowa się całkowicie. Nawet zwinięte (76 px) zjadało
      // piątą część szerokości telefonu, przez co główna treść dostawała 123 px
      // z 375 -- tablica w układzie kartowym nie miała się gdzie zmieścić.
      // Nawigacja i tak jest dziś w większości wyłączonymi placeholderami
      // („Wkrótce"), więc na małym ekranie nie traci się nic działającego.
      // ponytail: ukrycie, nie szuflada -- do zamiany na wysuwane menu, gdy
      // pozycje nawigacji zaczną coś robić.
      // Przypięty do okna: własna wysokość ekranu i własny scroll, żeby przy
      // długiej liście połączeń nawigacja i „Diagnostyka" (`mt-auto`, na dole)
      // nie odjeżdżały z widoku razem z treścią głównej kolumny.
      className="hidden shrink-0 flex-col gap-6 self-start sticky top-0 h-dvh overflow-y-auto border-r p-4 transition-[width] duration-200 sm:flex"
      style={{
        width: collapsed ? '76px' : '252px',
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-white shadow-lg"
            style={{ background: 'var(--accent-gradient)' }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6.5" />
              <rect x="4.3" y="12.5" width="11.4" height="2.4" rx="1.2" />
              <circle cx="7.3" cy="9" r="1" />
              <circle cx="12.7" cy="9" r="1" />
              <path d="M6.3 15.8 4.6 18M13.7 15.8l1.7 2.2" />
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-heading truncate text-[15px] font-bold">Monitor opóźnień</div>
              <div className="truncate text-[11px] text-text-muted">
                v{process.env.NEXT_PUBLIC_APP_VERSION} · {environmentLabel(process.env.NEXT_PUBLIC_APP_BRANCH ?? '')}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Rozwiń pasek boczny' : 'Zwiń pasek boczny'}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ChevronRightIcon size={14} className={collapsed ? '' : 'rotate-180'} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          if (item.kind === 'active') {
            const isActive = item.key === activeItem
            return (
              <Link
                key={item.key}
                href={item.href}
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

      {/* Tylko środowiska deweloperskie — na produkcji ten komponent nie
          istnieje w bundlu, patrz `PollerDiagnostics.tsx`. */}
      <PollerDiagnostics collapsed={collapsed} />
    </aside>
  )
}
