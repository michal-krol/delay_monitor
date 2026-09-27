'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { notFound, useParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { TopBar } from '@/components/TopBar'
import { CityPicker, type CityOption } from '@/components/CityPicker'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { CloseIcon } from '@/components/icons'
import { LinePanel } from '@/components/map/LinePanel'
import { LineSearch } from '@/components/map/LineSearch'
import { MapCard, type MapSelection } from '@/components/map/MapCard'
import { MapFilters } from '@/components/map/MapFilters'
import { MapLegend } from '@/components/map/MapLegend'
import { TransitMap, type MapHit, type MapView } from '@/components/map/TransitMap'
import {
  HIDE_AFTER_SEC,
  LAYER_LABEL,
  MODE_COLOR,
  VEHICLE_LAYERS,
  ageLabel,
  boundsContain,
  parseHidden,
  routeOverlay,
  serializeHidden,
  stopsBounds,
  vehicleLayerKey,
  type LayerKey,
} from '@/components/map/mapData'
import { useCityStops } from '@/hooks/useCityStops'
import { useCityVehicles } from '@/hooks/useCityVehicles'
import { useLineDetail } from '@/hooks/useLineDetail'
import { useRailStations } from '@/hooks/useRailStations'
import { getCity } from '@/lib/gtfs/cities'
import type { LineListEntry, LineRouteStop } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'

const WIDE_QUERY = '(min-width: 40rem)'

/** Szeroki ekran (panel obok mapy) vs telefon (arkusz od dołu). Na serwerze: telefon. */
function useIsWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(WIDE_QUERY)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  )
}

/** Linie miasta do wyszukiwarki linii — jedno pobranie, ponawiane, dopóki rozkład się wczytuje. */
function useCityLines(city: string): LineListEntry[] | null {
  const [lines, setLines] = useState<LineListEntry[] | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function load(): Promise<void> {
      try {
        const response = await fetch(`/api/gtfs/lines?city=${encodeURIComponent(city)}`)
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as { lines: Record<GtfsMode, LineListEntry[]> | null }
        if (cancelled) return
        if (json.lines === null) timer = setTimeout(() => void load(), 2_000)
        else setLines(Object.values(json.lines).flat())
      } catch {
        if (!cancelled) timer = setTimeout(() => void load(), 30_000)
      }
    }
    void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [city])
  return lines
}

export default function CityMapPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const feed = CITY_ID_PATTERN.test(city) ? getCity(city) : null
  if (feed === null) notFound()

  const [cities, setCities] = useState<CityOption[]>([])
  const [hidden, setHidden] = useState<Set<LayerKey>>(() => new Set())
  const [routeParam, setRouteParam] = useState<string | null>(null)
  const [directionId, setDirectionId] = useState(0)
  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lon: number; nonce: number } | null>(null)
  const [view, setView] = useState<MapView | null>(null)
  const [searchTab, setSearchTab] = useState<'place' | 'line'>('place')
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()
  const isWide = useIsWide()

  const vehiclesState = useCityVehicles(city)
  const stopsState = useCityStops(city)
  const railState = useRailStations()
  const lines = useCityLines(city)

  useEffect(() => {
    // Odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu; zły parametr po cichu ignorowany (AGENTS #4).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(parseHidden(readUrlParam))
    const line = readUrlParam('line')
    setRouteParam(line !== null && GTFS_ROUTE_ID_PATTERN.test(line) ? line : null)
    setDirectionId(readUrlParam('dir') === '1' ? 1 : 0)
    setMounted(true)
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

  // `?line=` to `routeId`; stare linki niosły numer linii („20") — dopasowujemy go dokładnie.
  const line = useMemo(() => {
    if (routeParam === null || lines === null) return null
    return lines.find((l) => l.routeId === routeParam) ?? lines.find((l) => l.line === routeParam) ?? null
  }, [routeParam, lines])

  const lineDetail = useLineDetail(city, line?.routeId ?? null)
  const route = useMemo(() => {
    const directions = lineDetail.detail?.directions ?? []
    const direction = directions.find((d) => d.directionId === directionId) ?? directions[0]
    if (line === null || direction === undefined) return null
    return { key: `${line.routeId}:${direction.directionId}`, overlay: routeOverlay(direction), color: MODE_COLOR[line.mode] }
  }, [line, lineDetail.detail, directionId])

  const vehiclesById = useMemo(() => new Map(vehiclesState.vehicles.map((v) => [v.id, v])), [vehiclesState.vehicles])
  const selectedVehicle = selection?.kind === 'vehicle' ? (vehiclesById.get(selection.id) ?? null) : null
  const liveVehicle = selectedVehicle !== null && selectedVehicle.ageSec <= HIDE_AFTER_SEC ? selectedVehicle : null
  const selectedAt =
    selection === null
      ? null
      : selection.kind === 'vehicle'
        ? liveVehicle
        : selection.lat !== null && selection.lon !== null
          ? { lat: selection.lat, lon: selection.lon }
          : null

  const vehicleLayers = useMemo(() => {
    const present = new Set(vehiclesState.vehicles.map((v) => vehicleLayerKey(v.mode)))
    return VEHICLE_LAYERS.filter((key) => present.has(key))
  }, [vehiclesState.vehicles])

  const feedArea = useMemo(() => (stopsState.stops === null ? null : stopsBounds(stopsState.stops)), [stopsState.stops])
  const outsideFeed = feedArea !== null && view !== null && !boundsContain(feedArea, view.center.lon, view.center.lat)

  const changeHidden = useCallback((next: Set<LayerKey>) => {
    setHidden(next)
    patchUrlParams({ hide: serializeHidden(next), vehicles: null, rail: null, mode: null })
  }, [])

  function chooseLine(next: LineListEntry | null, nextDirection = 0): void {
    setRouteParam(next?.routeId ?? null)
    setDirectionId(nextDirection)
    patchUrlParams({ line: next?.routeId ?? null, dir: next !== null && nextDirection === 1 ? '1' : null })
  }

  function showRoute(routeId: string, vehicleDirection: number | null): void {
    const target = lines?.find((l) => l.routeId === routeId) ?? null
    if (target === null) return
    setSelection(null)
    chooseLine(target, vehicleDirection === 1 ? 1 : 0)
  }

  function changeDirection(next: number): void {
    setDirectionId(next)
    patchUrlParams({ dir: next === 1 ? '1' : null })
  }

  function openLineStop(stop: LineRouteStop): void {
    const known = stopsState.stops?.find((s) => s.id === stop.stopId)
    const mode = known?.mode ?? (line?.mode === 'tram' || line?.mode === 'metro' ? line.mode : 'bus')
    setSelection({ kind: 'stop', id: stop.stopId, groupId: stop.groupId, name: stop.name, mode, lat: stop.lat, lon: stop.lon })
    setFocus({ lat: stop.lat, lon: stop.lon, nonce: Date.now() })
  }

  function onMapSelect(hit: MapHit | null): void {
    if (hit === null) return setSelection(null)
    if (hit.kind === 'vehicle') return setSelection({ kind: 'vehicle', id: hit.id })
    if (hit.kind === 'stop') {
      const stop = stopsState.stops?.find((s) => s.id === hit.id)
      if (stop !== undefined) setSelection({ kind: 'stop', id: stop.id, groupId: stop.groupId, name: stop.name, mode: stop.mode, lat: stop.lat, lon: stop.lon })
      return
    }
    const station = railState.stations?.find((s) => s.id === hit.id)
    if (station !== undefined) setSelection({ kind: 'rail', id: station.id, name: station.name, lat: station.lat, lon: station.lon })
  }

  function onSearchSelect(option: StationOption): void {
    const lat = option.lat ?? null
    const lon = option.lon ?? null
    if (option.kind === 'rail') {
      setSelection({ kind: 'rail', id: option.id, name: option.name, lat, lon })
    } else {
      // Zespół przystankowy: odjazdy całego zespołu; stacja metra (rodzic) ma w warstwie swój punkt.
      setSelection({ kind: 'stop', id: option.id, groupId: option.id, name: option.name, mode: option.mode ?? 'bus', lat, lon })
    }
    if (lat !== null && lon !== null) setFocus({ lat, lon, nonce: Date.now() })
  }

  const neverLoaded = vehiclesState.vehicles.length === 0
  const vehiclesFailed = vehiclesState.error !== null || vehiclesState.feed.state === 'failed'
  const freshness =
    neverLoaded && !vehiclesFailed
      ? 'wczytuję pozycje pojazdów…'
      : neverLoaded
        ? 'nie udało się pobrać pozycji pojazdów'
        : vehiclesFailed
          ? 'pozycje pojazdów nieaktualne — pokazujemy ostatnie dostępne'
          : vehiclesState.feed.ageMs !== null
            ? `pozycje pojazdów: ${ageLabel(Math.round(vehiclesState.feed.ageMs / 1000))}`
            : 'pozycje pojazdów na żywo'

  const problems = [
    stopsState.error && 'Nie udało się wczytać przystanków — ponawiam.',
    railState.error && 'Nie udało się wczytać stacji kolejowych — ponawiam.',
  ].filter((p): p is string => typeof p === 'string')

  const vehiclesOnLine = line === null ? 0 : vehiclesState.vehicles.filter((v) => v.routeId === line.routeId && v.ageSec <= HIDE_AFTER_SEC).length
  // Karta wybranego obiektu ma pierwszeństwo; po jej zamknięciu wraca panel linii.
  const card =
    selection !== null ? (
      <MapCard key={`${selection.kind}:${selection.id}`} selection={selection} vehicle={liveVehicle} city={city} onClose={() => setSelection(null)} onShowRoute={showRoute} />
    ) : line !== null ? (
      <LinePanel
        line={line}
        detail={lineDetail.detail}
        error={lineDetail.error}
        directionId={directionId}
        vehiclesOnLine={vehiclesOnLine}
        city={city}
        onDirection={changeDirection}
        onStop={openLineStop}
        onClose={() => chooseLine(null)}
      />
    ) : null

  const placeSearch = (
    <StationSearch endpoint={`/api/search?city=${encodeURIComponent(city)}&rail=all`} placeholder="Szukaj stacji lub przystanku…" onSelect={onSearchSelect} wide />
  )
  const lineSearch = <LineSearch lines={lines} onSelect={chooseLine} />

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="px-4 py-4 sm:px-8 sm:py-5">
        <TopBar
          title="Mapa transportu"
          subtitle={`${feed.name} · ${freshness}`}
          actions={<CityPicker cities={cities} current={city} hrefFor={(id) => `/city/${id}/map`} />}
        />
      </div>

      <div className="relative flex min-h-[60vh] flex-1">
        <div className="relative min-w-0 flex-1">
          {mounted && (
            <TransitMap
              key={city}
              ariaLabel={`Mapa transportu — ${feed.name}`}
              initialCenter={feed.mapCenter}
              vehicles={vehiclesState.vehicles}
              stops={stopsState.stops}
              railStations={railState.stations}
              hidden={hidden}
              routeId={line?.routeId ?? null}
              selected={selectedAt}
              focus={focus}
              route={route}
              dark={resolvedTheme === 'dark'}
              onSelect={onMapSelect}
              onViewChange={setView}
            />
          )}

          <div className="pointer-events-none absolute left-3 right-14 top-3 z-10 flex flex-col gap-2 sm:left-4 sm:top-4">
            <div className="pointer-events-auto flex flex-wrap items-stretch gap-2">
              {isWide ? (
                <>
                  <div className="w-72">{placeSearch}</div>
                  <div className="w-52">{lineSearch}</div>
                </>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="glass flex w-max rounded-xl p-0.5 text-xs font-semibold" role="group" aria-label="Czego szukasz">
                    {(['place', 'line'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        aria-pressed={searchTab === tab}
                        onClick={() => setSearchTab(tab)}
                        className={`rounded-lg px-3 py-1 ${searchTab === tab ? 'text-white' : 'text-text-secondary'}`}
                        style={searchTab === tab ? { background: 'var(--accent-gradient)' } : undefined}
                      >
                        {tab === 'place' ? 'Przystanek' : 'Linia'}
                      </button>
                    ))}
                  </div>
                  {searchTab === 'place' ? placeSearch : lineSearch}
                </div>
              )}
              <div className={isWide ? '' : 'self-end'}>
                <MapFilters hidden={hidden} vehicleLayers={vehicleLayers} onChange={changeHidden} />
              </div>
            </div>

            {(hidden.size > 0 || line !== null) && (
              <ul className="pointer-events-auto flex flex-wrap gap-1.5" aria-label="Aktywne filtry">
                {line !== null && (
                  <Chip label={`Linia ${line.line}`} removeLabel={`Pokaż wszystkie linie zamiast linii ${line.line}`} onRemove={() => chooseLine(null)} />
                )}
                {[...hidden].map((key) => (
                  <Chip
                    key={key}
                    label={`Ukryte: ${LAYER_LABEL[key].toLowerCase()}`}
                    removeLabel={`Pokaż: ${LAYER_LABEL[key].toLowerCase()}`}
                    onRemove={() => {
                      const next = new Set(hidden)
                      next.delete(key)
                      changeHidden(next)
                    }}
                  />
                ))}
              </ul>
            )}

            {problems.map((problem) => (
              <p key={problem} role="status" className="glass-strong pointer-events-auto w-max max-w-full rounded-xl px-3 py-1.5 text-sm text-red-700 dark:text-red-300">
                {problem}
              </p>
            ))}
          </div>

          {outsideFeed && (
            <p role="status" className="glass-strong absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-xs text-text-secondary">
              Przystanki i pojazdy miejskie: tylko {feed.name} i okolice
            </p>
          )}

          {(isWide || selection === null) && (
            <div className="absolute bottom-8 right-3 z-10 sm:right-4">
              <MapLegend />
            </div>
          )}

          {!isWide && card !== null && <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[62%] flex-col p-2">{card}</div>}
        </div>

        {isWide && card !== null && <aside className="flex w-[380px] shrink-0 flex-col py-3 pr-3 pl-3" aria-label="Wybrany obiekt">{card}</aside>}
      </div>
    </div>
  )
}

function Chip({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  return (
    <li className="glass-strong inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-xs font-medium">
      {label}
      <button type="button" onClick={onRemove} aria-label={removeLabel} className="grid h-6 w-6 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
        <CloseIcon size={12} />
      </button>
    </li>
  )
}
