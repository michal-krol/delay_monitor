'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BottomNav } from './BottomNav'
import { MobileHeader } from './MobileHeader'
import { activeItemFromPath } from './navItems'
import { isSearchShortcut } from './searchShortcut'
import { SearchDialog } from './SearchDialog'
import { Sidebar } from './Sidebar'

/**
 * Cała powłoka aplikacji renderowana raz w `(app)/layout.tsx`, a nie osobno w każdej stronie —
 * wcześniej pasek boczny montował się od nowa przy każdej nawigacji i migał zwijaniem/rozwijaniem
 * (stan z `useSidebarCollapsed` odczytywany od zera). Tu też żyje jedno okno wyszukiwania
 * (przycisk w nagłówku/pasku bocznym, Ctrl/Cmd+K, „/").
 */
export function AppChrome() {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (searchOpen || !isSearchShortcut(event)) return
      event.preventDefault()
      setSearchOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [searchOpen])

  return (
    <>
      <MobileHeader onSearch={openSearch} />
      <Sidebar activeItem={activeItemFromPath(pathname)} onSearch={openSearch} />
      <BottomNav />
      <SearchDialog open={searchOpen} onClose={closeSearch} />
    </>
  )
}
