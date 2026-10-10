'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BottomNav } from './BottomNav'
import { MobileHeader } from './MobileHeader'
import { activeItemFromPath } from './navItems'
import { OfflineBanner } from './OfflineBanner'
import { InstallPrompt } from './InstallPrompt'
import { isSearchShortcut } from './searchShortcut'
import { SearchDialog } from './SearchDialog'
import { Sidebar } from './Sidebar'
import { installViewTransitionGate } from '@/lib/viewTransitionGate'

// Przed pierwszą nawigacją: przejścia widoku tylko w Chromium i bez reduced-motion (`viewTransitionGate.ts`).
installViewTransitionGate()

/**
 * Cała powłoka aplikacji renderowana raz w `(app)/layout.tsx`, a nie osobno w każdej stronie —
 * wcześniej pasek boczny montował się od nowa przy każdej nawigacji i migał zwijaniem/rozwijaniem
 * (stan z `useSidebarCollapsed` odczytywany od zera). Tu też żyje jedno okno wyszukiwania
 * (przycisk w dolnym pasku/pasku bocznym, Ctrl/Cmd+K, „/").
 */
export function AppChrome() {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  // Jedna akcja „Szukaj" dla wszystkich wejść. PR 2 (trasa `/search`) rozgałęzi ją tu: poniżej `SM_UP` nawigacja
  // na `/search`, od `sm` nadal to okno.
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // Skrót już obsłużony gdzie indziej albo trwa kompozycja IME — nie przechwytujemy.
      if (event.defaultPrevented || event.isComposing || !isSearchShortcut(event)) return
      // Otwarte okno: Ctrl/Cmd+K nadal nie może trafić do przeglądarki (pasek adresu); „/" w polu to zwykły znak
      // (isSearchShortcut go odrzuca), więc tu zostaje tylko odebranie skrótu.
      event.preventDefault()
      if (!searchOpen) setSearchOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [searchOpen])

  return (
    <>
      <MobileHeader />
      <Sidebar activeItem={activeItemFromPath(pathname)} onSearch={openSearch} />
      <BottomNav onSearch={openSearch} />
      <OfflineBanner />
      <InstallPrompt />
      <SearchDialog open={searchOpen} onClose={closeSearch} />
    </>
  )
}
