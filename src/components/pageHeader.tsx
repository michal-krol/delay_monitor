'use client'

import { createContext, useContext, useEffect, useId, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { UseStationWeatherResult } from '@/hooks/useStationWeather'

export type PageHeader = {
  title: string
  backLabel?: string
  backHref?: string
  onBack?: () => void
  share?: boolean
}
type HeaderWeather = { weather: UseStationWeatherResult; name: string }
type Owned<T> = { owner: string; value: T } | null
const Header = createContext<PageHeader | null>(null)
const Weather = createContext<HeaderWeather | null>(null)
const SetHeader = createContext<Dispatch<SetStateAction<Owned<PageHeader>>>>(() => {})
const SetWeather = createContext<Dispatch<SetStateAction<Owned<HeaderWeather>>>>(() => {})

/** The route owns data; the persistent chrome consumes its snapshot without fetching. */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<Owned<PageHeader>>(null)
  const [weather, setWeather] = useState<Owned<HeaderWeather>>(null)
  return (
    <SetHeader value={setHeader}>
      <SetWeather value={setWeather}>
        <Header value={header?.value ?? null}>
          <Weather value={weather?.value ?? null}>{children}</Weather>
        </Header>
      </SetWeather>
    </SetHeader>
  )
}

export function usePageHeader({ title, backLabel, backHref, onBack, share }: PageHeader): void {
  const owner = useId()
  const setHeader = useContext(SetHeader)
  useEffect(() => {
    setHeader({ owner, value: { title, backLabel, backHref, onBack, share } })
    return () => setHeader((current) => current?.owner === owner ? null : current)
  }, [owner, setHeader, title, backLabel, backHref, onBack, share])
}

/** Null = embedded widget: the host route keeps ownership of the header. */
export function useHeaderWeather(weather: UseStationWeatherResult | null, name: string): void {
  const owner = useId()
  const setWeather = useContext(SetWeather)
  const value = useMemo(() => weather === null ? null : { weather, name }, [weather, name])
  useEffect(() => {
    if (value === null) return
    setWeather({ owner, value })
    return () => setWeather((current) => current?.owner === owner ? null : current)
  }, [owner, setWeather, value])
}

export const usePageHeaderContext = () => useContext(Header)
export const useHeaderWeatherContext = () => useContext(Weather)
