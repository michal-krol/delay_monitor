'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

/**
 * `Sidebar` renderowany raz w `(app)/layout.tsx`, a nie osobno w każdej stronie
 * — wcześniej montował się od nowa przy każdej nawigacji i migał zwijaniem/
 * rozwijaniem (stan z `useSidebarCollapsed` odczytywany od zera przy każdym
 * montowaniu). `activeItem` wyliczane z adresu, bo tylko Pulpit ma odpowiednik
 * w menu (reszta pozycji to wyłączone „Wkrótce").
 */
export function AppSidebar() {
  const pathname = usePathname()
  const isLines = pathname === '/linie' || /^\/miasto\/[^/]+\/lini[ae]/.test(pathname)
  const activeItem =
    pathname === '/'
      ? 'pulpit'
      : isLines
        ? 'trasy'
        : pathname === '/miasto' || pathname.startsWith('/miasto/')
          ? 'odjazdy'
          : undefined
  return <Sidebar activeItem={activeItem} />
}
