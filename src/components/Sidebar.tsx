'use client'

import { useEffect, useState } from 'react'
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed'
import { AppLogo, ChevronRightIcon, ICON_SIZE, SearchIcon } from './icons'
import { NavList, type ActiveItem } from './navItems'
import { PollerDiagnostics } from './PollerDiagnostics'

type Props = {
  // Opcjonalny -- strony bez odpowiednika w menu (np. /station/[stationId],
  // /connection/...) nic nie podświetlają.
  activeItem?: ActiveItem
  /** Otwiera okno wyszukiwania (`AppChrome`). */
  onSearch: () => void
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

export function Sidebar({ activeItem, onSearch }: Props) {
  const { collapsed, toggle } = useSidebarCollapsed()
  // Platforma znana dopiero w przeglądarce — ustalana w efekcie, żeby nie rozjechać znacznika serwer/klient.
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jak `ThemeToggle`: wartość zależna od przeglądarki
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])

  return (
    <aside
      data-collapsed={collapsed}
      // Poniżej `sm` menu chowa się całkowicie. Nawet zwinięte (76 px) zjadało
      // piątą część szerokości telefonu, przez co główna treść dostawała 123 px
      // z 375 -- tablica w układzie kartowym nie miała się gdzie zmieścić.
      // Poniżej `sm` nawigacja żyje w dolnym pasku `BottomNav`.
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
          <AppLogo size={36} />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-heading truncate text-[15px] font-bold">Monitor opóźnień</div>
              <div className="truncate text-xs text-text-muted">
                v{process.env.NEXT_PUBLIC_APP_VERSION} · {environmentLabel(process.env.NEXT_PUBLIC_APP_BRANCH ?? '')}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Rozwiń pasek boczny' : 'Zwiń pasek boczny'}
          className="touch-44 relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ChevronRightIcon size={ICON_SIZE.inline} className={collapsed ? '' : 'rotate-180'} />
        </button>
      </div>

      <button
        type="button"
        onClick={onSearch}
        aria-keyshortcuts="Control+K Meta+K /"
        // Zwinięty pasek nie ma widocznego tekstu, więc nazwa idzie z `aria-label`; rozwinięty — z napisu.
        aria-label={collapsed ? 'Szukaj' : undefined}
        className="touch-44 relative flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <SearchIcon />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">Szukaj</span>
            <kbd aria-hidden="true" className="font-sans text-xs text-text-muted">
              {isMac ? '⌘ K' : 'Ctrl K'}
            </kbd>
          </>
        )}
      </button>

      <NavList activeItem={activeItem} collapsed={collapsed} />

      {/* Tylko środowiska deweloperskie — na produkcji ten komponent nie
          istnieje w bundlu, patrz `PollerDiagnostics.tsx`. */}
      <PollerDiagnostics collapsed={collapsed} />
    </aside>
  )
}
