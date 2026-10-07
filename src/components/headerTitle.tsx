'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Nazwa bieżącej tablicy (stacji/przystanku) dla nagłówka telefonu: przy przewijaniu nazwa aplikacji
 * ustępuje miejsca nazwie tablicy (`MobileHeader`, CSS scroll-driven w `globals.css`). Dwa konteksty — wartość
 * czyta tylko nagłówek, setter tylko tablica — więc zmiana nazwy nie renderuje ponownie całej tablicy.
 */
const TitleContext = createContext<string | null>(null)
const SetTitleContext = createContext<(title: string | null) => void>(() => {})

export function HeaderTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  return (
    <SetTitleContext.Provider value={setTitle}>
      <TitleContext.Provider value={title}>{children}</TitleContext.Provider>
    </SetTitleContext.Provider>
  )
}

/** Tablica ogłasza swoją nazwę na czas życia; `null` (osadzona tablica na ekranie miasta) nie ogłasza nic. */
export function useHeaderTitle(name: string | null): void {
  const setTitle = useContext(SetTitleContext)
  useEffect(() => {
    if (name === null) return
    setTitle(name)
    return () => setTitle(null)
  }, [name, setTitle])
}

export function useContextTitle(): string | null {
  return useContext(TitleContext)
}
