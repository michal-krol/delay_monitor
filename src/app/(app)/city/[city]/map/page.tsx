'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { notFound, useParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { z } from 'zod'
import { BottomSheet } from '@/components/BottomSheet'
import { TopBar } from '@/components/TopBar'
import { CityPicker } from '@/components/CityPicker'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { CityIcon, CloseIcon, ListIcon, ShareIcon, ICON_SIZE } from '@/components/icons'
import { LinePanel } from '@/components/map/LinePanel'
import { LineSearch } from '@/components/map/LineSearch'
import { MapCard, type MapSelection } from '@/components/map/MapCard'
import { stopDisplayName } from '@/components/stopName'
import { MapFilters } from '@/components/map/MapFilters'
import { MapLegend } from '@/components/map/MapLegend'
import { PinnedMenu, NearbyPanel, VisibleListPanel, type PinnedPoint } from '@/components/map/MapPanels'
import { TransitMap, type MapHit, type MapView } from '@/components/map/TransitMap'
import {
  HIDE_AFTER_SEC,
  LAYER_LABEL,
  MAP_ZOOM,
  VEHICLE_LAYERS,
  boundsContain,
  formatAt,
  nearbyPoints,
  parseAt,
  parseHidden,
  routeOverlay,
  serializeHidden,
  stopsBounds,
  vehicleLayerKey,
  type LayerKey,
  type MapCamera,
  type NearbyPoint,
  type VisibleItem,
} from '@/components/map/mapData'
import { useCities } from '@/hooks/useCities'
import { useCityStops } from '@/hooks/useCityStops'
import { useCityVehicles } from '@/hooks/useCityVehicles'
import { pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { useLineDetail } from '@/hooks/useLineDetail'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import { useRailStations } from '@/hooks/useRailStations'
import { useShareUrl } from '@/hooks/useShareUrl'
import { formatAgo } from '@/lib/format'
import { getCity } from '@/lib/gtfs/cities'
import type { BackboneLine, LineListEntry, LineRouteStop } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'
import { lineColor } from '@/components/transitMode'

const WIDE_QUERY = '(min-width: 40rem)'
const LAST_VIEW_KEY = 'monitor.map.view.v1'
/** `localStorage` to dane spoza aplikacji — schemat, nie asercja typu (AGENTS.md #4). */
const lastViewSchema = z.object({ city: z.string(), at: z.string() })

/** Ostatni widok mapy tego miasta w tej przeglądarce; brak / uszkodzony wpis = `null`. */
function readLastView(city: string): MapCamera | null {
  try {
    const parsed = lastViewSchema.safeParse(JSON.parse(window.localStorage.getItem(LAST_VIEW_KEY) ?? 'null'))
    return parsed.success && parsed.data.city === city ? parseAt(parsed.data.at) : null
  } catch {
    return null
  }
}

function saveLastView(city: string, at: string): void {
  try {
    window.localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({ city, at }))
  } catch {
    // Prywatne okno / zablokowany storage — wygoda, nie funkcja; bez zapisu.
  }
}

/** Jedno pobranie listy z `url` (wybór pola przez `pick`), ponawiane drabinką `usePolling`, dopóki rozkład się wczytuje (`null`). */
function useCityList<T>(url: string, pick: (json: Record<string, unknown>) => T[] | null): T[] | null {
  // Opakowanie `{ items }`, bo `null` z `pick` („rozkład się wczytuje") ma napędzać ponawianie, a nie znaczyć „brak odpowiedzi".
  const { data } = usePolling<{ items: T[] | null }>(url, async () => ({ items: pick(await fetchJson<Record<string, unknown>>(url)) }), {
    refreshMs: null,
    isLoading: (result) => result.items === null,
  })
  return data?.items ?? null
}

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

export default function CityMapPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const feed = CITY_ID_PATTERN.test(city) ? getCity(city) : null
  if (feed === null) notFound()

  const { cities } = useCities()
  const [hidden, setHidden] = useState<Set<LayerKey>>(() => new Set())
  const [routeParam, setRouteParam] = useState<string | null>(null)
  const [directionId, setDirectionId] = useState(0)
  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lon: number; nonce: number; zoom?: number } | null>(null)
  const [view, setView] = useState<MapView | null>(null)
  const [searchTab, setSearchTab] = useState<'place' | 'line'>('place')
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()
  const isWide = useIsWide()

  const vehiclesState = useCityVehicles(city)
  const stopsState = useCityStops(city)
  const railState = useRailStations()
  const lines = useCityList<LineListEntry>(`/api/gtfs/lines?city=${encodeURIComponent(city)}`, (json) =>
    json.lines === null ? null : Object.values(json.lines as Record<GtfsMode, LineListEntry[]>).flat()
  )
  const backbone = useCityList<BackboneLine>(`/api/gtfs/backbone?city=${encodeURIComponent(city)}`, (json) => json.lines as BackboneLine[] | null)
  const [initialCamera, setInitialCamera] = useState<MapCamera | null>(null)
  const [followId, setFollowId] = useState<string | null>(null)
  const { share, status: shareStatus } = useShareUrl()
  const { pinnedItems, addPinned, removePinned, isPinned } = usePinned()
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [nearby, setNearby] = useState<{ lat: number; lon: number } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [visible, setVisible] = useState<{ items: VisibleItem[]; overflow: boolean } | null>(null)

  useEffect(() => {
    // Odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu; zły parametr po cichu ignorowany (AGENTS #4).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(parseHidden(readUrlParam))
    const line = readUrlParam('line')
    setRouteParam(line !== null && GTFS_ROUTE_ID_PATTERN.test(line) ? line : null)
    setDirectionId(readUrlParam('dir') === '1' ? 1 : 0)
    setAlertsOnly(readUrlParam('alerts') === '1')
    // Kadr: link `?at=` > ostatni widok w tej przeglądarce > centrum miasta.
    setInitialCamera(parseAt(readUrlParam('at')) ?? readLastView(city) ?? { ...feed.mapCenter, zoom: MAP_ZOOM.initial })
    setMounted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- odtworzenie raz, przy wejściu
  }, [])

  const onViewChange = useCallback(
    (next: MapView) => {
      setView(next)
      const at = formatAt({ ...next.center, zoom: next.zoom })
      patchUrlParams({ at })
      saveLastView(city, at)
    },
    [city]
  )

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
    return { key: `${line.routeId}:${direction.directionId}`, overlay: routeOverlay(direction), color: lineColor(line.mode, line.kind).bg }
  }, [line, lineDetail.detail, directionId])

  const vehiclesById = useMemo(() => new Map(vehiclesState.vehicles.map((v) => [v.id, v])), [vehiclesState.vehicles])
  const selectedVehicle = selection?.kind === 'vehicle' ? (vehiclesById.get(selection.id) ?? null) : null
  const liveVehicle = selectedVehicle !== null && selectedVehicle.ageSec <= HIDE_AFTER_SEC ? selectedVehicle : null
  const selectedAt =
    selection === null
      ? nearby
      : selection.kind === 'vehicle'
        ? liveVehicle
        : selection.lat !== null && selection.lon !== null
          ? { lat: selection.lat, lon: selection.lon }
          : null

  const vehicleLayers = useMemo(() => {
    const present = new Set(vehiclesState.vehicles.map((v) => vehicleLayerKey(v.mode)))
    return VEHICLE_LAYERS.filter((key) => present.has(key))
  }, [vehiclesState.vehicles])

  // Komunikat dla czytnika ekranu: ile pojazdów pokazuje mapa po zmianie filtrów/linii.
  // Celowo NIE przy każdym odczycie co 15 s — to byłby szum co kwadrans minuty.
  const vehiclesRef = useRef(vehiclesState.vehicles)
  vehiclesRef.current = vehiclesState.vehicles
  const vehicleCountAnnouncement = useMemo(() => {
    const shown = vehiclesRef.current.filter(
      (v) =>
        v.ageSec <= HIDE_AFTER_SEC &&
        !hidden.has(vehicleLayerKey(v.mode)) &&
        (line === null || v.routeId === line.routeId) &&
        (!alertsOnly || (v.shortName !== null && vehiclesState.alertLines.includes(v.shortName)))
    ).length
    return `Na mapie ${shown} pojazdów`
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tylko zmiana filtrów i pierwsze wczytanie, nie każdy odczyt
  }, [hidden, line, alertsOnly, vehiclesState.vehicles.length === 0])

  const feedArea = useMemo(() => (stopsState.stops === null ? null : stopsBounds(stopsState.stops)), [stopsState.stops])
  const outsideFeed = feedArea !== null && view !== null && !boundsContain(feedArea, view.center.lon, view.center.lat)

  const onlyLines = useMemo(() => (alertsOnly ? new Set(vehiclesState.alertLines) : null), [alertsOnly, vehiclesState.alertLines])

  // Przypięte (Pulpit) z pozycją na mapie: stacje z listy kolei, przystanki tego miasta z listy przystanków.
  const pinnedPoints = useMemo<PinnedPoint[]>(() => {
    const points: PinnedPoint[] = []
    for (const fav of pinnedItems) {
      const hit =
        fav.kind === 'pkp'
          ? railState.stations?.find((s) => s.id === fav.id)
          : fav.city === city
            ? stopsState.stops?.find((s) => s.id === fav.id || s.groupId === fav.id)
            : undefined
      if (hit !== undefined) points.push({ key: pinnedKey(fav), name: fav.name, lat: hit.lat, lon: hit.lon })
    }
    return points
  }, [pinnedItems, railState.stations, stopsState.stops, city])

  // Pojazdy w liście z kierunkiem — dwa „20" obok siebie muszą się dać odróżnić.
  const visibleItems = useMemo<VisibleItem[] | null>(
    () =>
      visible?.items.map((item) => {
        const v = item.kind === 'vehicle' ? vehiclesById.get(item.id) : undefined
        return v?.headsign ? { ...item, label: `${item.label || '—'} → ${v.headsign}` } : item
      }) ?? null,
    [visible, vehiclesById]
  )

  const nearbyList = useMemo<NearbyPoint[]>(
    () => (nearby === null ? [] : nearbyPoints(nearby, stopsState.stops ?? [], railState.stations ?? [])),
    [nearby, stopsState.stops, railState.stations]
  )

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
    setSelection({ kind: 'stop', id: stop.stopId, groupId: stop.groupId, name: stop.name, code: stop.code, mode, lat: stop.lat, lon: stop.lon })
    setFocus({ lat: stop.lat, lon: stop.lon, nonce: Date.now() })
  }

  function changeAlertsOnly(next: boolean): void {
    setAlertsOnly(next)
    patchUrlParams({ alerts: next ? '1' : null })
  }

  function focusOn(lat: number, lon: number): void {
    setFocus({ lat, lon, nonce: Date.now() })
  }

  function openNearby(point: NearbyPoint): void {
    if (point.kind === 'rail') {
      setSelection({ kind: 'rail', id: point.id, name: point.name, lat: point.lat, lon: point.lon })
      focusOn(point.lat, point.lon)
    } else {
      const { stop } = point
      setSelection({ kind: 'stop', id: stop.id, groupId: stop.groupId, name: stop.name, code: stop.code, mode: stop.mode, lat: stop.lat, lon: stop.lon })
      focusOn(stop.lat, stop.lon)
    }
  }

  function openVisible(item: VisibleItem): void {
    onMapSelect(item)
    const at =
      item.kind === 'vehicle'
        ? vehiclesById.get(item.id)
        : item.kind === 'stop'
          ? stopsState.stops?.find((s) => s.id === item.id)
          : railState.stations?.find((s) => s.id === item.id)
    if (at !== undefined) focusOn(at.lat, at.lon)
  }

  function openPinned(pinnedItem: PinnedPoint): void {
    const fav = pinnedItems.find((f) => pinnedKey(f) === pinnedItem.key)
    if (fav?.kind === 'pkp') onMapSelect({ kind: 'rail', id: fav.id })
    else {
      const stop = stopsState.stops?.find((s) => s.id === fav?.id || s.groupId === fav?.id)
      if (stop !== undefined) onMapSelect({ kind: 'stop', id: stop.id })
    }
    focusOn(pinnedItem.lat, pinnedItem.lon)
  }

  /** Klucz przypiętego dla karty stacji/przystanku; `null` dla pojazdu. */
  function pinnedItemFor(sel: MapSelection): PinnedItem | null {
    if (sel.kind === 'rail') return { kind: 'pkp', id: sel.id, name: sel.name }
    // Jeden przystanek zespołu (pin na mapie) → przypięty z numerem; wybór z wyszukiwarki = cały zespół.
    if (sel.kind === 'stop')
      return sel.id !== sel.groupId
        ? { kind: 'gtfs', city, id: sel.id, name: stopDisplayName(sel.name, sel.code), member: true }
        : { kind: 'gtfs', city, id: sel.id, name: sel.name }
    return null
  }

  function onMapSelect(hit: MapHit | null): void {
    if (hit === null) return setSelection(null)
    if (hit.kind === 'vehicle') return setSelection({ kind: 'vehicle', id: hit.id })
    if (hit.kind === 'stop') {
      const stop = stopsState.stops?.find((s) => s.id === hit.id)
      if (stop !== undefined) setSelection({ kind: 'stop', id: stop.id, groupId: stop.groupId, name: stop.name, code: stop.code, mode: stop.mode, lat: stop.lat, lon: stop.lon })
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
      setSelection({ kind: 'stop', id: option.id, groupId: option.id, name: option.name, code: null, mode: option.mode ?? 'bus', lat, lon })
    }
    if (lat !== null && lon !== null) setFocus({ lat, lon, nonce: Date.now() })
  }

  const neverLoaded = vehiclesState.vehicles.length === 0
  const vehiclesFailed = vehiclesState.error !== null || vehiclesState.feed.state === 'failed'
  const freshness =
    neverLoaded && !vehiclesFailed
      ? 'wczytywanie pozycji pojazdów…'
      : neverLoaded
        ? 'nie udało się pobrać pozycji pojazdów'
        : vehiclesFailed
          ? 'pozycje pojazdów nieaktualne — pokazujemy ostatnie dostępne'
          : vehiclesState.feed.ageMs !== null
            ? `pozycje pojazdów: ${formatAgo(Math.round(vehiclesState.feed.ageMs / 1000))}`
            : 'pozycje pojazdów na żywo'

  const problems = [
    stopsState.error && 'Nie udało się wczytać przystanków — ponawiam.',
    railState.error && 'Nie udało się wczytać stacji kolejowych — ponawiam.',
  ].filter((p): p is string => typeof p === 'string')

  const vehiclesOnLine = line === null ? 0 : vehiclesState.vehicles.filter((v) => v.routeId === line.routeId && v.ageSec <= HIDE_AFTER_SEC).length
  // Karta wybranego obiektu ma pierwszeństwo; po jej zamknięciu wraca panel linii.
  const selectionPinned = selection !== null ? pinnedItemFor(selection) : null
  const following = followId !== null && selection?.kind === 'vehicle' && selection.id === followId && liveVehicle !== null
  const card =
    selection !== null ? (
      <MapCard
        key={`${selection.kind}:${selection.id}`}
        selection={selection}
        vehicle={liveVehicle}
        city={city}
        onClose={() => {
          setSelection(null)
          setFollowId(null)
        }}
        onShowRoute={showRoute}
        following={following}
        onToggleFollow={() => setFollowId(following ? null : selection.id)}
        pinned={selectionPinned !== null ? isPinned(pinnedKey(selectionPinned)) : undefined}
        onTogglePin={
          selectionPinned === null
            ? undefined
            : () => {
                const key = pinnedKey(selectionPinned)
                if (isPinned(key)) removePinned(key)
                else addPinned(selectionPinned)
              }
        }
        onNearby={
          selection.kind !== 'vehicle' && selection.lat !== null && selection.lon !== null
            ? () => {
                setNearby({ lat: selection.lat!, lon: selection.lon! })
                setSelection(null)
              }
            : undefined
        }
        alertLines={vehiclesState.alertLines}
      />
    ) : nearby !== null ? (
      <NearbyPanel points={nearbyList} city={city} onOpen={openNearby} onClose={() => setNearby(null)} />
    ) : listOpen ? (
      <VisibleListPanel items={visibleItems} overflow={visible?.overflow ?? false} onOpen={openVisible} onClose={() => setListOpen(false)} />
    ) : line !== null ? (
      <LinePanel
        line={line}
        detail={lineDetail.detail}
        alerts={lineDetail.alerts}
        error={lineDetail.error}
        directionId={directionId}
        vehiclesOnLine={vehiclesOnLine}
        city={city}
        onDirection={changeDirection}
        onStop={openLineStop}
        onClose={() => chooseLine(null)}
      />
    ) : null
  // Nowy obiekt w arkuszu = nowy `key` → arkusz startuje znów w `peek`.
  const cardKey =
    selection !== null ? `${selection.kind}:${selection.id}` : nearby !== null ? 'nearby' : listOpen ? 'list' : `line:${line?.routeId}`

  const placeSearch = (
    <StationSearch endpoint={`/api/search?city=${encodeURIComponent(city)}&rail=all`} placeholder="Szukaj stacji lub przystanku…" onSelect={onSearchSelect} wide />
  )
  const lineSearch = <LineSearch lines={lines} onSelect={chooseLine} />

  return (
    // Wysokość = ekran bez nagłówka i dolnego paska (od `sm` obie zmienne to 0): strona się nie przewija.
    <div className="flex h-[calc(100dvh-var(--header-h)-var(--bottom-nav-h))] min-w-0 flex-1 flex-col overflow-hidden">
      <div className="px-4 py-2 sm:px-8 sm:py-5">
        <TopBar
          compact
          title="Mapa transportu"
          subtitle={`${feed.name} · ${freshness}`}
          actions={<CityPicker compact cities={cities} current={city} hrefFor={(id) => `/city/${id}/map`} />}
        />
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {mounted && initialCamera !== null && (
            <TransitMap
              key={city}
              ariaLabel={`Mapa transportu — ${feed.name}`}
              initialCamera={initialCamera}
              vehicles={vehiclesState.vehicles}
              backbone={backbone}
              stops={stopsState.stops}
              railStations={railState.stations}
              hidden={hidden}
              routeId={line?.routeId ?? null}
              selected={selectedAt}
              focus={focus}
              route={route}
              follow={following ? liveVehicle : null}
              pinnedItems={pinnedPoints}
              onlyLines={onlyLines}
              listOpen={listOpen}
              onContextPoint={(point) => {
                setSelection(null)
                setNearby(point)
              }}
              onVisibleChange={(items, overflow) => setVisible({ items, overflow })}
              dark={resolvedTheme === 'dark'}
              onSelect={onMapSelect}
              onViewChange={onViewChange}
              onUserMove={() => setFollowId(null)}
            />
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col">
            <div className="relative z-10 ml-3 mr-14 mt-3 flex shrink-0 flex-col gap-2 sm:ml-4 sm:mt-4">
              <div className="pointer-events-auto flex flex-wrap items-stretch gap-2">
                {isWide ? (
                  <>
                    <div className="w-72">{placeSearch}</div>
                    <div className="w-52">{lineSearch}</div>
                  </>
                ) : (
                  // `min-w-40`: na telefonie przyciski schodzą pod pole zamiast ścisnąć je do „Sz…";
                  // `ml-auto` niżej trzyma je z prawej, bo ich panele otwierają się w lewo.
                  <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                    <div className="glass flex w-max rounded-xl p-0.5 text-xs font-semibold" role="group" aria-label="Czego szukasz">
                      {(['place', 'line'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          aria-pressed={searchTab === tab}
                          onClick={() => setSearchTab(tab)}
                          className={`min-h-9 rounded-lg px-3.5 py-1.5 ${searchTab === tab ? 'text-white' : 'text-text-secondary'}`}
                          style={searchTab === tab ? { background: 'var(--accent-gradient)' } : undefined}
                        >
                          {tab === 'place' ? 'Przystanek' : 'Linia'}
                        </button>
                      ))}
                    </div>
                    {searchTab === 'place' ? placeSearch : lineSearch}
                  </div>
                )}
                <div className={`flex gap-2 ${isWide ? '' : 'ml-auto self-end'}`}>

                  <button
                    type="button"
                    aria-pressed={listOpen}
                    onClick={() => {
                      setListOpen((open) => !open)
                      setSelection(null)
                      setNearby(null)
                    }}
                    className={`glass inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition ${
                      listOpen ? 'text-white' : 'text-foreground hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                    style={listOpen ? { background: 'var(--accent-gradient)' } : undefined}
                  >
                    <ListIcon size={ICON_SIZE.button} />
                    Lista
                  </button>
                  <PinnedMenu pinnedItems={pinnedPoints} onOpen={openPinned} />
                  <MapFilters
                    hidden={hidden}
                    vehicleLayers={vehicleLayers}
                    onChange={changeHidden}
                    alertsOnly={alertsOnly}
                    onAlertsOnly={changeAlertsOnly}
                  />
                  <button
                    type="button"
                    onClick={() => void share()}
                    aria-label="Udostępnij ten widok mapy"
                    className="glass grid min-h-11 w-11 place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <ShareIcon size={ICON_SIZE.button} />
                  </button>
                </div>
              </div>

              {(hidden.size > 0 || line !== null || alertsOnly) && (
                <ul className="pointer-events-auto flex flex-wrap gap-1.5" aria-label="Aktywne filtry">
                  {line !== null && (
                    <Chip label={`Linia ${line.line}`} removeLabel={`Pokaż wszystkie linie zamiast linii ${line.line}`} onRemove={() => chooseLine(null)} />
                  )}
                  {alertsOnly && (
                    <Chip label="Tylko linie z utrudnieniami" removeLabel="Pokaż wszystkie linie, nie tylko z utrudnieniami" onRemove={() => changeAlertsOnly(false)} />
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

              {shareStatus !== 'idle' && (
                <p role="status" className="glass-strong pointer-events-auto w-max max-w-full rounded-xl px-3 py-1.5 text-sm">
                  {shareStatus === 'copied' ? 'Skopiowano link do tego widoku.' : 'Nie udało się skopiować — skopiuj adres z paska przeglądarki.'}
                </p>
              )}
              {problems.map((problem) => (
                <p key={problem} role="status" className="glass-strong pointer-events-auto w-max max-w-full rounded-xl px-3 py-1.5 text-sm text-error-text">
                  {problem}
                </p>
              ))}
            </div>
          </div>

          {!isWide && card !== null && <BottomSheet key={cardKey}>{card}</BottomSheet>}

          <p className="sr-only" aria-live="polite">
            {vehicleCountAnnouncement}
          </p>

          {/* Pozycja związana z `top-44`/`sm:top-36` wrappera legendy niżej — przesuwasz przycisk, przesuń legendę. */}
          <button
            type="button"
            onClick={() => setFocus({ ...feed.mapCenter, zoom: MAP_ZOOM.initial, nonce: Date.now() })}
            aria-label={`Pokaż całe miasto — ${feed.name}`}
            title="Pokaż całe miasto"
            className="glass absolute right-3 top-[88px] z-10 grid h-11 w-11 place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <CityIcon size={ICON_SIZE.tile} />
          </button>

          {outsideFeed && (
            <p role="status" className="glass-strong absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-xs text-text-secondary">
              Przystanki i pojazdy miejskie: tylko {feed.name} i okolice
            </p>
          )}

          {(isWide || card === null) && (
            // `sm:top-36` (144 px) = pod kontrolkami prawego rogu: zoom MapLibre (10–68 px) i „Pokaż całe
            // miasto” (`top-[88px]` + `h-11` = 132 px) + 12 px odstępu. Od `top-3` rozwinięta legenda
            // przykrywała je na niskich ekranach (800×600, 375×667). Poniżej `sm` (= `WIDE_QUERY`)
            // przyciski Lista/Filtry/Udostępnij schodzą do drugiego rzędu (114–158 px przy 375 px),
            // stąd `top-44` (176 px) — przy 144 px legenda zakrywała ich dolne 14 px.
            <div className="pointer-events-none absolute bottom-8 right-3 top-44 z-10 flex flex-col justify-end sm:right-4 sm:top-36">
              <MapLegend />
            </div>
          )}

        </div>

        {isWide && card !== null && <aside className="flex w-aside shrink-0 flex-col py-3 pr-3 pl-3" aria-label="Wybrany obiekt">{card}</aside>}
      </div>
    </div>
  )
}

function Chip({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  return (
    <li className="glass-strong inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-xs font-medium">
      {label}
      <button type="button" onClick={onRemove} aria-label={removeLabel} className="touch-44 relative -my-1 grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
        <CloseIcon size={ICON_SIZE.chip} />
      </button>
    </li>
  )
}
