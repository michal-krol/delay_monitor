'use client'

import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed'
import { ChevronRightIcon } from './icons'
import { NavList, type ActiveItem } from './navItems'
import { PollerDiagnostics } from './PollerDiagnostics'

type Props = {
  // Opcjonalny -- jedyny prawdziwy wpis nawigacji to "Pulpit"; reszta jest
  // `kind: 'disabled'` (patrz NAV_ITEMS w navItems.tsx), więc strony bez
  // odpowiednika w menu (np. /odjazdy/[stationId], /polaczenie/...) nie mają
  // czego podświetlić.
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

      <NavList activeItem={activeItem} collapsed={collapsed} />

      {/* Tylko środowiska deweloperskie — na produkcji ten komponent nie
          istnieje w bundlu, patrz `PollerDiagnostics.tsx`. */}
      <PollerDiagnostics collapsed={collapsed} />
    </aside>
  )
}
