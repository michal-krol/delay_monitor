'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { trapTab } from '@/lib/focusTrap'
import { AppLogo, CloseIcon, MenuIcon } from './icons'
import { IconButton } from './IconButton'
import { activeItemFromPath, NavList } from './navItems'

/**
 * Nawigacja mobilna: poniżej `sm` pasek boczny jest schowany całkowicie
 * (`Sidebar` `hidden sm:flex`), bo nawet zwinięty zjadał piątą część szerokości
 * telefonu. Odkąd trzy pozycje menu coś robią (Pulpit / Odjazdy / Trasy),
 * schowanie ich odcinało realne funkcje — stąd cienki pasek app-level z
 * hamburgerem i wysuwana szuflada NAD treścią (overlay + backdrop), tylko
 * `sm:hidden`. Desktop nietknięty.
 */
export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const openerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

  const close = useCallback(() => setOpen(false), [])

  // Zmiana adresu (tap w link nawigacji albo redirect) zamyka szufladę.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reakcja na zmianę trasy, jak useSidebarCollapsed/useCityContext w tym repo
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    const opener = openerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      trapTab(event, drawerRef.current)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [open, close])

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b px-4 py-2.5 sm:hidden"
        style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <AppLogo size={32} />
          <span className="font-heading text-[15px] font-bold">Monitor opóźnień</span>
        </div>

        <button
          ref={openerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Otwórz menu"
          aria-expanded={open}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <MenuIcon size={20} />
        </button>
      </header>

      {/* Overlay poza `<header>` — `sticky` + `z-index` na nagłówku tworzy
          kontekst stackingu, w którym `fixed` szuflada nie mogła się wybić nad
          treść strony. Jako sibling `{children}` w kontenerze layoutu z `z-50`
          wygrywa. */}
      {open && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            data-testid="mobile-nav-backdrop"
            onClick={close}
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu nawigacji"
            className="absolute inset-y-0 left-0 flex w-[80vw] max-w-xs flex-col gap-6 overflow-y-auto border-r p-4 shadow-2xl"
            style={{ background: 'var(--bg-gradient)', borderColor: 'var(--sidebar-border)' }}
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="font-heading text-[15px] font-bold">Monitor opóźnień</span>
              <IconButton ref={closeRef} label="Zamknij menu" onClick={close}>
                <CloseIcon size={16} />
              </IconButton>
            </div>
            <NavList activeItem={activeItemFromPath(pathname)} onNavigate={close} />
          </aside>
        </div>
      )}
    </>
  )
}
