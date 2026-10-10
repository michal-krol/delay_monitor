'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BottomNav } from './BottomNav'
import { MobileHeader } from './MobileHeader'
import { activeItemFromPath } from './navItems'
import { OfflineBanner } from './OfflineBanner'
import { InstallPrompt } from './InstallPrompt'
import { isSearchShortcut } from './searchShortcut'
import { SearchDialog } from './SearchDialog'
import { Sidebar } from './Sidebar'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { NAV_TAB_TYPES } from '@/lib/navTransition'
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
  const router = useRouter()
  const wide = useMediaQuery(SM_UP, true)
  const [searchOpen, setSearchOpen] = useState(false)
  // Jedna akcja „Szukaj" dla wszystkich wejść (dolny pasek, pasek boczny, Ctrl/Cmd+K, „/"): na `/search` fokus
  // w polu, poniżej `SM_UP` trasa `/search` (jak zakładka), od `sm` okno.
  const openSearch = useCallback(() => {
    if (pathname === '/search') {
      document.querySelector<HTMLElement>('main input[type="search"]')?.focus()
    } else if (wide) {
      setSearchOpen(true)
    } else {
      router.push('/search', { transitionTypes: NAV_TAB_TYPES })
    }
  }, [pathname, wide, router])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // Skrót już obsłużony gdzie indziej albo trwa kompozycja IME — nie przechwytujemy.
      if (event.defaultPrevented || event.isComposing || !isSearchShortcut(event)) return
      // Otwarte okno: Ctrl/Cmd+K nadal nie może trafić do przeglądarki (pasek adresu); „/" w polu to zwykły znak
      // (isSearchShortcut go odrzuca), więc tu zostaje tylko odebranie skrótu.
      event.preventDefault()
      if (!searchOpen) openSearch()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [searchOpen, openSearch])

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
