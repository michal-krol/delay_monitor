'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { CityPicker, type CityOption } from '@/components/CityPicker'
import { ModeFilter, type ModeValue } from '@/components/ModeFilter'
import { CityVehicleMap } from '@/components/CityVehicleMap'
import { useCityVehicles } from '@/hooks/useCityVehicles'
import { useRailStations } from '@/hooks/useRailStations'
import { readUrlParam, patchUrlParams } from '@/lib/urlState'
import type { GtfsMode } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN } from '@/lib/validation'

const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']

export default function CityMapPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const [cities, setCities] = useState<CityOption[]>([])
  const [mode, setMode] = useState<ModeValue>('all')
  const [line, setLine] = useState('')
  const [showVehicles, setShowVehicles] = useState(true)
  const [showRail, setShowRail] = useState(true)
  const vehiclesState = useCityVehicles(city)
  const railState = useRailStations(city)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Zły `?mode=` po cichu ignorowany (AGENTS #4) -- nie każdy string z URL-a jest GtfsMode.
    const urlMode = readUrlParam('mode')
    const validMode = urlMode !== null && MODE_ORDER.includes(urlMode as GtfsMode) ? (urlMode as ModeValue) : 'all'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu
    setMode(validMode)
    setLine(readUrlParam('line') ?? '')
    setShowVehicles(readUrlParam('vehicles') !== '0')
    setShowRail(readUrlParam('rail') !== '0')
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityOption[] }) => {
        if (!cancelled) setCities(body.cities)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function onModeChange(next: ModeValue): void {
    setMode(next)
    patchUrlParams({ mode: next === 'all' ? null : next })
  }

  function onLineChange(next: string): void {
    setLine(next)
    patchUrlParams({ line: next.trim() === '' ? null : next })
  }

  function onToggleVehicles(): void {
    const next = !showVehicles
    setShowVehicles(next)
    patchUrlParams({ vehicles: next ? null : '0' })
  }

  function onToggleRail(): void {
    const next = !showRail
    setShowRail(next)
    patchUrlParams({ rail: next ? null : '0' })
  }

  const cityName = useMemo(() => cities.find((option) => option.id === city)?.name ?? city, [cities, city])

  const available = useMemo<GtfsMode[]>(() => {
    const present = new Set(vehiclesState.vehicles.map((v) => v.mode).filter((m): m is GtfsMode => m !== null))
    return MODE_ORDER.filter((m) => present.has(m))
  }, [vehiclesState.vehicles])

  const filtered = useMemo(() => {
    const needle = line.trim().toLowerCase()
    return vehiclesState.vehicles.filter((v) => {
      if (mode !== 'all' && v.mode !== mode) return false
      if (needle !== '' && !(v.shortName?.toLowerCase().includes(needle) ?? false)) return false
      return true
    })
  }, [vehiclesState.vehicles, mode, line])

  // Wczytuje się: nigdy jeszcze nie mieliśmy pozycji. Nie udało się: błąd/feed
  // failed I zero pozycji kiedykolwiek widzianych. W obu innych przypadkach
  // (także po chwilowym błędzie z danymi z poprzedniego pollu) renderujemy
  // mapę z tym, co mamy — AGENTS #7.
  const neverLoaded = vehiclesState.vehicles.length === 0
  const loading = neverLoaded && vehiclesState.error === null && vehiclesState.feed.state !== 'failed'
  const failed = neverLoaded && (vehiclesState.error !== null || vehiclesState.feed.state === 'failed')

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="px-4 py-4 sm:px-8 sm:py-5">
        <TopBar
          title={`Mapa — ${cityName}`}
          subtitle="Wszystkie pojazdy komunikacji miejskiej na żywo"
          actions={<CityPicker cities={cities} current={city} hrefFor={(id) => `/city/${id}/map`} />}
        />
      </div>

      <div className="relative min-h-[60vh] flex-1">
        {loading ? (
          <p className="p-4 text-sm text-text-secondary">Wczytuję pozycje pojazdów…</p>
        ) : failed ? (
          <p className="p-4 text-sm text-red-700 dark:text-red-300">Nie udało się pobrać pozycji pojazdów.</p>
        ) : (
          <>
            <div ref={toolbarRef} className="glass absolute left-4 right-4 top-4 z-10 flex flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5" role="group" aria-label="Warstwy mapy">
                <button
                  type="button"
                  aria-pressed={showVehicles}
                  onClick={onToggleVehicles}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    showVehicles ? 'text-white' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  style={showVehicles ? { background: 'var(--accent-gradient)', borderColor: 'transparent' } : { borderColor: 'var(--surface-border)' }}
                >
                  Pojazdy
                </button>
                <button
                  type="button"
                  aria-pressed={showRail}
                  onClick={onToggleRail}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    showRail ? 'text-white' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  style={showRail ? { background: 'var(--accent-gradient)', borderColor: 'transparent' } : { borderColor: 'var(--surface-border)' }}
                >
                  Kolej
                </button>
              </div>
              <ModeFilter available={available} value={mode} onChange={onModeChange} />
              <input
                type="search"
                value={line}
                onChange={(event) => onLineChange(event.target.value)}
                placeholder="Numer linii…"
                aria-label="Filtruj po numerze linii"
                className="glass w-full max-w-[10rem] rounded-xl px-3 py-1.5 text-sm text-foreground placeholder:text-text-muted outline-none transition focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <CityVehicleMap
              key={city}
              vehicles={filtered}
              vehiclesVisible={showVehicles}
              railStations={showRail ? railState.stations : []}
              city={city}
              ariaLabel={`Mapa miasta ${cityName}`}
              topOverlayRef={toolbarRef}
            />
          </>
        )}
      </div>
    </div>
  )
}
