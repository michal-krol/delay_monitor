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
export type HeaderDataSource = {
  id: string
  label: string
  updatedAt: string | number | null
  error?: boolean
  warning?: string
  refresh?: () => void
}
const Data = createContext<HeaderDataSource[]>([])
const SetData = createContext<Dispatch<SetStateAction<Record<string, HeaderDataSource>>>>(() => {})
type Owned<T> = { owner: string; value: T } | null
const Header = createContext<PageHeader | null>(null)
const Weather = createContext<HeaderWeather | null>(null)
const SetHeader = createContext<Dispatch<SetStateAction<Owned<PageHeader>>>>(() => {})
const SetWeather = createContext<Dispatch<SetStateAction<Owned<HeaderWeather>>>>(() => {})

/** The route owns data; the persistent chrome consumes its snapshot without fetching. */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<Owned<PageHeader>>(null)
  const [weather, setWeather] = useState<Owned<HeaderWeather>>(null)
  const [data, setData] = useState<Record<string, HeaderDataSource>>({})
  const sources = useMemo(() => [...new Map(Object.values(data).map((source) => [source.id, source])).values()], [data])
  return (
    <SetData value={setData}>
      <Data value={sources}>
        <SetHeader value={setHeader}>
          <SetWeather value={setWeather}>
            <Header value={header?.value ?? null}>
              <Weather value={weather?.value ?? null}>{children}</Weather>
            </Header>
          </SetWeather>
        </SetHeader>
      </Data>
    </SetData>
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

/** Each mounted source owns only its own registration; no polling or ticking clock here. */
export function useHeaderData(source: HeaderDataSource | null): void {
  const owner = useId()
  const setData = useContext(SetData)
  const id = source?.id
  const label = source?.label
  const updatedAt = source?.updatedAt
  const error = source?.error
  const warning = source?.warning
  const refresh = source?.refresh
  useEffect(() => {
    if (id === undefined || label === undefined) return
    setData((current) => ({ ...current, [owner]: { id, label, updatedAt: updatedAt ?? null, error, warning, refresh } }))
    return () => setData((current) => {
      const next = { ...current }
      delete next[owner]
      return next
    })
  }, [owner, setData, id, label, updatedAt, error, warning, refresh])
}

export const useHeaderDataContext = () => useContext(Data)

export function HeaderDataRegistration({ source }: { source: HeaderDataSource }) {
  useHeaderData(source)
  return null
}
