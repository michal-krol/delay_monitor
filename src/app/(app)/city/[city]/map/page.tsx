'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { notFound, useParams, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { BottomSheet } from '@/components/BottomSheet'
import { TopBar } from '@/components/TopBar'
import { CityPicker } from '@/components/CityPicker'
import { UnifiedSearch } from '@/components/UnifiedSearch'
import { CityIcon, ICON_SIZE } from '@/components/icons'
import { LinePanel } from '@/components/map/LinePanel'
import { MapCard, type MapSelection } from '@/components/map/MapCard'
import { stopDisplayName } from '@/components/stopName'
import { LocateControl } from '@/components/map/LocateControl'
import { MapLegend } from '@/components/map/MapLegend'
import { NearbyPanel, VisibleListPanel, type PinnedPoint } from '@/components/map/MapPanels'
import { OverviewPanel } from '@/components/map/OverviewPanel'
import { ActiveFilterChips, MapToolbar } from '@/components/map/MapToolbar'
import { MapNotices } from '@/components/MapNotices'
import { pinnedMapPoints, stopSelection, vehicleFreshness } from '@/components/map/mapPageStatus'
import { TransitMap, type MapHit } from '@/components/map/TransitMap'
import {
  HIDE_AFTER_SEC,
  MAP_ZOOM,
  VEHICLE_LAYERS,
  activeFilterCount,
  boundsContain,
  parseHidden,
  serializeHidden,
  stopsBounds,
  vehicleLayerKey,
  type LayerKey,
  type VisibleItem,
} from '@/components/map/mapData'
import { nearbyPoints, type NearbyPoint } from '@/components/map/mapCamera'
import { useCities } from '@/hooks/useCities'
import { useCityLines } from '@/hooks/useCityLines'
import { useCityStops } from '@/hooks/useCityStops'
import { useCityVehicles } from '@/hooks/useCityVehicles'
import { pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { useCityList } from '@/hooks/useCityList'
import { useMapLine } from '@/hooks/useMapLine'
import { useRailStations } from '@/hooks/useRailStations'
import { useShareUrl } from '@/hooks/useShareUrl'
import { useMapCamera } from '@/hooks/useMapCamera'
import { discoveryHref, type DiscoveryResult } from '@/lib/discovery'
import { pluralPl } from '@/lib/plural'
import { getCity } from '@/lib/gtfs/cities'
import type { BackboneLine, LineRouteStop } from '@/lib/gtfs/query'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { CITY_ID_PATTERN } from '@/lib/validation'
import { parseVehicleMapSelection, type VehicleMapSelection } from '@/lib/vehicleMapLink'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'

export default function CityMapPage() {
  const router = useRouter()
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const feed = CITY_ID_PATTERN.test(city) ? getCity(city) : null
  if (feed === null) notFound()

  const { cities } = useCities()
  const [hidden, setHidden] = useState<Set<LayerKey>>(() => new Set())
  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [vehicleLink, setVehicleLink] = useState<VehicleMapSelection | null>(null)
  const appliedVehicleLink = useRef<string | null>(null)
  const clearVehicleLink = useCallback(() => {
    setVehicleLink(null)
    patchUrlParams({ vehicle: null, trip: null, date: null })
  }, [])
  // Wynik wyszukiwarki bez pozycji na mapie: komunikat z linkiem do szczegółów (kamera się nie rusza).
  const [noPosition, setNoPosition] = useState<{ name: string; href: string | null; linkLabel: string } | null>(null)
  const { resolvedTheme } = useTheme()
  // Szeroki ekran (panel obok mapy) vs telefon (arkusz od dołu). Na serwerze: telefon.
  const isWide = useMediaQuery(SM_UP, false)

  const vehiclesState = useCityVehicles(city)
  const stopsState = useCityStops(city)
  const railState = useRailStations()
  // Jedno pobranie katalogu linii: zasila stronę i (jako `lineSource`) wyszukiwarkę — ten sam ranking `rankLines`.
  const lineState = useCityLines(city)
  const lines = lineState.lines
  const { line, lineDetail, route, directionId, chooseLine, changeDirection } = useMapLine(city, lines)
  const backbone = useCityList<BackboneLine>(`/api/gtfs/backbone?city=${encodeURIComponent(city)}`, (json) => json.lines as BackboneLine[] | null)
  const [followId, setFollowId] = useState<string | null>(null)
  const { share, status: shareStatus } = useShareUrl()
  const { pinnedItems, loaded: pinsLoaded, addPinned, removePinned, replacePinned, isPinned } = usePinned()
  const [alertsOnly, setAlertsOnly] = useState(false)
  const {
    userLocation,
    initialCamera,
    view,
    focus,
    nearby,
    setNearby,
    nearbyFromGps,
    nearbyPending,
    focusOn,
    flyTo,
    liftViewBlock,
    recordView,
    openNearbyAround,
    showNearbyAt,
    showMyLocation,
    stillHere,
  } = useMapCamera({ city, mapCenter: feed.mapCenter, clearSelection: () => setSelection(null) })
  // Insety kamery (px): góra = pasek kontrolek nad mapą, dół = widoczny arkusz (tylko telefon). Mierzone, nie zgadywane.
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [topInset, setTopInset] = useState(0)
  const [sheetInset, setSheetInset] = useState(0)
  // Arkusz z „Moją lokalizacją" jest przemontowywany przy każdej zmianie obiektu (`key`), więc fokus trzeba oddać ręcznie.
  const locateButtonRef = useRef<HTMLButtonElement>(null)
  const locateHadFocusRef = useRef(false)
  const refocusLocateRef = useRef(false)
  const [listOpen, setListOpen] = useState(false)
  const [visible, setVisible] = useState<{ items: VisibleItem[]; overflow: boolean } | null>(null)

  useEffect(() => {
    // Odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu; zły parametr po cichu ignorowany (AGENTS #4).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(parseHidden(readUrlParam))
    setAlertsOnly(readUrlParam('alerts') === '1')
    const readVehicle = () => {
      appliedVehicleLink.current = null
      setVehicleLink(parseVehicleMapSelection(new URLSearchParams(window.location.search)))
      setSelection(null)
    }
    readVehicle()
    window.addEventListener('popstate', readVehicle)
    return () => window.removeEventListener('popstate', readVehicle)
  }, [])

  useEffect(() => {
    if (nearby !== null) return
    if (refocusLocateRef.current) locateButtonRef.current?.focus({ preventScroll: true })
    refocusLocateRef.current = false
    locateHadFocusRef.current = false
  }, [nearby])

  useEffect(() => {
    const el = toolbarRef.current
    if (el === null) return
    // Dolna krawędź kontrolek względem mapy (z górnym marginesem): tyle kadru zasłaniają pasek, wyszukiwarka i chipy.
    const measure = (): void => setTopInset(Math.round(el.offsetTop + el.offsetHeight))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Mapa zgłasza kadr po KAŻDYM `idle` (na telefonie zawsze); ten sam skład to ten sam stan — bez ponownego renderu całej strony.
  const onVisibleChange = useCallback((items: VisibleItem[], overflow: boolean) => {
    setVisible((prev) =>
      prev !== null && prev.overflow === overflow && prev.items.length === items.length && prev.items.every((item, i) => item.kind === items[i].kind && item.id === items[i].id && item.label === items[i].label)
        ? prev
        : { items, overflow }
    )
  }, [])

  const vehiclesById = useMemo(() => new Map(vehiclesState.vehicles.map((v) => [v.id, v])), [vehiclesState.vehicles])
  const selectedCandidate = selection?.kind === 'vehicle' ? (vehiclesById.get(selection.id) ?? null) : null
  const selectedVehicle = selectedCandidate !== null && vehicleLink !== null && selection?.id === vehicleLink.id && (selectedCandidate.tripId !== vehicleLink.tripId || (vehicleLink.serviceDate !== undefined && selectedCandidate.serviceDate !== vehicleLink.serviceDate)) ? null : selectedCandidate
  const liveVehicle = selectedVehicle !== null && selectedVehicle.ageSec <= HIDE_AFTER_SEC ? selectedVehicle : null
  useEffect(() => {
    if (vehicleLink === null || (vehiclesState.feed.state === 'loading' && vehiclesState.vehicles.length === 0)) return
    // An effect queued for the old URL must not overwrite a newer manual selection.
    const requested = parseVehicleMapSelection(new URLSearchParams(window.location.search))
    if (requested?.id !== vehicleLink.id || requested.tripId !== vehicleLink.tripId || requested.serviceDate !== vehicleLink.serviceDate) return
    const target = vehiclesById.get(vehicleLink.id)
    // Only the exact dated trip may determine the camera, never a recycled entity id.
    const available = target !== undefined && target.tripId === vehicleLink.tripId && (vehicleLink.serviceDate === undefined || target.serviceDate === vehicleLink.serviceDate) && target.ageSec <= HIDE_AFTER_SEC
    const key = `${JSON.stringify(vehicleLink)}:${available}`
    if (appliedVehicleLink.current === key) return
    appliedVehicleLink.current = key
    setSelection({ kind: 'vehicle', id: vehicleLink.id })
    setFollowId(null)
    setNearby(null)
    setAlertsOnly(false)
    chooseLine(null)
    const nextHidden = new Set(hidden)
    if (available) nextHidden.delete(vehicleLayerKey(target.mode))
    setHidden(nextHidden)
    patchUrlParams({ hide: serializeHidden(nextHidden), alerts: null, nearby: null })
    if (available) focusOn(target.lat, target.lon)
  }, [vehicleLink, vehiclesById, vehiclesState.feed.state, vehiclesState.vehicles.length, hidden, chooseLine, focusOn, setNearby])
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
  const vehicleCountKnown = vehiclesState.lastSuccessAt !== null
  const vehicleCountAnnouncement = useMemo(() => {
    // Nieznane („wczytywanie", „nie udało się") to nie zero (#7): cisza do pierwszego udanego odczytu.
    if (!vehicleCountKnown) return ''
    const shown = vehiclesRef.current.filter(
      (v) =>
        v.ageSec <= HIDE_AFTER_SEC &&
        !hidden.has(vehicleLayerKey(v.mode)) &&
        (line === null || v.routeId === line.routeId) &&
        (!alertsOnly || (v.shortName !== null && vehiclesState.alertLines.includes(v.shortName)))
    ).length
    return `Na mapie ${shown} ${pluralPl(shown, 'pojazd', 'pojazdy', 'pojazdów')}`
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tylko zmiana filtrów i pierwsze wczytanie, nie każdy odczyt
  }, [hidden, line, alertsOnly, vehicleCountKnown])

  const feedArea = useMemo(() => (stopsState.stops === null ? null : stopsBounds(stopsState.stops)), [stopsState.stops])
  const outsideFeed = feedArea !== null && view !== null && !boundsContain(feedArea, view.center.lon, view.center.lat)

  const onlyLines = useMemo(() => (alertsOnly ? new Set(vehiclesState.alertLines) : null), [alertsOnly, vehiclesState.alertLines])

  const pinnedPoints = useMemo(() => pinnedMapPoints(pinnedItems, city, railState.stations, stopsState.stops), [pinnedItems, railState.stations, stopsState.stops, city])

  // Pojazdy w liście z kierunkiem — dwa „20" obok siebie muszą się dać odróżnić.
  const visibleItems = useMemo<VisibleItem[] | null>(
    () =>
      visible?.items.map((item) => {
        const v = item.kind === 'vehicle' ? vehiclesById.get(item.id) : undefined
        if (v === undefined) return item
        // Wiek GPS dokładamy z odczytu co 15 s (mapa go nie zna) — wiersz mówi „Pozycja sprzed …".
        return { ...item, ageSec: v.ageSec, ...(v.headsign ? { label: `${item.label || '—'} → ${v.headsign}` } : {}) }
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

  function showRoute(routeId: string, vehicleDirection: number | null): void {
    const target = lines?.find((l) => l.routeId === routeId) ?? null
    if (target === null) return
    clearVehicleLink()
    setSelection(null)
    chooseLine(target, vehicleDirection === 1 ? 1 : 0)
  }

  function openLineStop(stop: LineRouteStop): void {
    clearVehicleLink()
    const known = stopsState.stops?.find((s) => s.id === stop.stopId)
    // Rodzaj przystanku z listy miasta, a gdy jej brak — rodzaj linii (kolej miejska i „inne" nie udają autobusu).
    const mode = known?.mode ?? line?.mode ?? 'other'
    setSelection({ kind: 'stop', id: stop.stopId, groupId: stop.groupId, name: stop.name, code: stop.code, mode, lat: stop.lat, lon: stop.lon })
    focusOn(stop.lat, stop.lon)
  }

  function changeAlertsOnly(next: boolean): void {
    setAlertsOnly(next)
    patchUrlParams({ alerts: next ? '1' : null })
  }

  /** „Wyczyść filtry": domyślne warstwy, bez linii/kierunku/utrudnień; miasto (ścieżka) i `?at=` zostają. */
  function clearFilters(): void {
    changeHidden(new Set())
    changeAlertsOnly(false)
    chooseLine(null)
  }

  /** „×"/Escape w „W pobliżu": arkusz przemontował się przy otwarciu, więc stary przycisk lokalizacji nie istnieje — fokus wraca na nowy. */
  function closeNearby(): void {
    refocusLocateRef.current = locateHadFocusRef.current
    setNearby(null)
  }

  function openNearby(point: NearbyPoint): void {
    clearVehicleLink()
    if (point.kind === 'rail') {
      setSelection({ kind: 'rail', id: point.id, name: point.name, lat: point.lat, lon: point.lon })
      focusOn(point.lat, point.lon, nearbyFromGps)
    } else {
      const { stop } = point
      setSelection(stopSelection(stop))
      focusOn(stop.lat, stop.lon, nearbyFromGps)
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
    else if (fav?.kind === 'gtfs' && fav.member === true) {
      const stop = stopsState.stops?.find((s) => s.id === fav.id)
      if (stop !== undefined) onMapSelect({ kind: 'stop', id: stop.id })
    } else if (fav?.kind === 'gtfs') {
      // Przypięty zespół (albo stary wpis pod id przystanku): karta ZESPOŁU, nie pierwszego przystanku —
      // inaczej klucz przypięcia się nie zgadza i gwiazdka jest pusta.
      const stop = stopsState.stops?.find((s) => s.groupId === fav.id || s.id === fav.id)
      if (stop !== undefined) setSelection({ ...stopSelection(stop), id: stop.groupId, code: null })
      // Stary wpis zespołu pod id przystanku: przepisujemy na id zespołu od razu, żeby gwiazdka na karcie była zapełniona.
      if (stop !== undefined && fav.id !== stop.groupId) replacePinned(pinnedKey(fav), { ...fav, id: stop.groupId })
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
    clearVehicleLink()
    if (hit === null) return setSelection(null)
    if (hit.kind === 'vehicle') return setSelection({ kind: 'vehicle', id: hit.id })
    if (hit.kind === 'stop') {
      const stop = stopsState.stops?.find((s) => s.id === hit.id)
      if (stop !== undefined) setSelection(stopSelection(stop))
      return
    }
    const station = railState.stations?.find((s) => s.id === hit.id)
    if (station !== undefined) setSelection({ kind: 'rail', id: station.id, name: station.name, lat: station.lat, lon: station.lon })
  }

  /** Kurs otwiera szczegóły; miejsca i linie wybierają kontekst mapy bez wymyślania pozycji. */
  function onSearchPick(result: DiscoveryResult): void {
    clearVehicleLink()
    if (result.kind === 'train') {
      const href = discoveryHref(result)
      if (href !== null) router.push(href)
      return
    }
    setNoPosition(null)
    if (result.kind === 'line') {
      // Panel linii jest ostatni w kolejności kart — zwalniamy to, co go przesłania.
      setSelection(null)
      setNearby(null)
      setListOpen(false)
      chooseLine(result.line)
      return
    }
    if (result.kind === 'rail') {
      const { id, name } = result.station
      const lat = result.station.lat ?? null
      const lon = result.station.lon ?? null
      if (lat === null || lon === null) return setNoPosition({ name, href: discoveryHref(result), linkLabel: 'Szczegóły stacji' })
      setSelection({ kind: 'rail', id, name, lat, lon })
      return focusOn(lat, lon)
    }
    // Zespół przystanków: konkretne przystanki z listy miasta (po `groupId`), środek ich pozycji; wynik niesie ten sam
    // środek z serwera (`groupCentroid`, ta sama reguła) — na wypadek, gdy lista przystanków jeszcze się wczytuje. Numeru przystanku nie zgadujemy (`code: null`).
    const { stop } = result
    const members = stopsState.stops?.filter((s) => s.groupId === stop.id) ?? []
    const at =
      members.length > 0
        ? { lat: members.reduce((sum, s) => sum + s.lat, 0) / members.length, lon: members.reduce((sum, s) => sum + s.lon, 0) / members.length }
        : stop.lat !== undefined && stop.lon !== undefined
          ? { lat: stop.lat, lon: stop.lon }
          : null
    if (at === null) return setNoPosition({ name: stop.name, href: discoveryHref(result), linkLabel: 'Szczegóły przystanku' })
    setSelection({ kind: 'stop', id: stop.id, groupId: stop.id, name: stop.name, code: null, mode: stop.mode ?? members[0]?.mode ?? 'other', lat: at.lat, lon: at.lon })
    focusOn(at.lat, at.lon)
  }

  const neverLoaded = vehiclesState.vehicles.length === 0
  const vehiclesFailed = vehiclesState.error !== null || vehiclesState.feed.state === 'failed'
  const freshness = vehicleFreshness({ vehicleCount: vehiclesState.vehicles.length, failed: vehiclesFailed, lastSuccessAt: vehiclesState.lastSuccessAt, now: vehiclesState.now }, feed.timezone)

  const problems = [
    stopsState.error && 'Nie udało się wczytać przystanków — ponawiam.',
    railState.error && 'Nie udało się wczytać stacji kolejowych — ponawiam.',
  ].filter((p): p is string => typeof p === 'string')

  const filterCount = activeFilterCount({ hidden, line: line !== null, alertsOnly })
  const vehiclesOnLine = line === null ? 0 : vehiclesState.vehicles.filter((v) => v.routeId === line.routeId && v.ageSec <= HIDE_AFTER_SEC).length
  // Karta wybranego obiektu ma pierwszeństwo; po jej zamknięciu wraca panel linii.
  const selectionPinned = selection !== null ? pinnedItemFor(selection) : null
  const following = followId !== null && selection?.kind === 'vehicle' && selection.id === followId && liveVehicle !== null
  // Kadr trasy (wybór linii) i śledzenie pojazdu przenoszą kamerę z dala od użytkownika — świadomie, bez przeciągnięcia.
  const routeKey = route?.key ?? null
  // Layout effect: blokada ma zejść w tym samym commicie, w którym mapa dostaje trasę/śledzenie, zanim przyjdzie kolejny `moveend` (zwykły efekt bywa odroczony).
  useLayoutEffect(() => {
    if (routeKey !== null || following) liftViewBlock()
  }, [routeKey, following, liftViewBlock])
  const card =
    selection !== null ? (
      <MapCard
        key={`${selection.kind}:${selection.id}`}
        selection={selection}
        vehicle={selectedVehicle}
        vehicleUnavailableMessage={vehicleLink !== null && liveVehicle === null ? 'Wskazany pojazd nie jest dostępny dla tego kursu.' : undefined}
        city={city}
        onClose={() => {
          clearVehicleLink()
          setSelection(null)
          setFollowId(null)
        }}
        onShowRoute={showRoute}
        following={following}
        onToggleFollow={() => setFollowId(following ? null : selection.id)}
        pinned={selectionPinned !== null ? isPinned(pinnedKey(selectionPinned)) : undefined}
        pinsLoaded={pinsLoaded}
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
                openNearbyAround({ lat: selection.lat!, lon: selection.lon! })
                setSelection(null)
              }
            : undefined
        }
        alertLines={vehiclesState.alertLines}
      />
    ) : nearby !== null ? (
      <NearbyPanel points={nearbyList} city={city} onOpen={openNearby} onClose={closeNearby} departures={!nearbyFromGps} />
    ) : listOpen && (isWide || line !== null) ? (
      // Telefon bez linii: „Lista" to przegląd rozwinięty do `half` (niżej), nie drugie okno z tą samą listą.
      <VisibleListPanel
        items={visibleItems}
        overflow={visible?.overflow ?? false}
        onOpen={openVisible}
        onClose={() => setListOpen(false)}
        onClearFilters={filterCount > 0 ? clearFilters : undefined}
      />
    ) : line !== null ? (
      <LinePanel
        line={line}
        detail={lineDetail.detail}
        alerts={lineDetail.alerts}
        alertsState={lineDetail.alertsState}
        alertsStale={lineDetail.alertsStale}
        error={lineDetail.error}
        directionId={directionId}
        vehiclesOnLine={neverLoaded && vehiclesState.feed.state !== 'ready' && vehiclesState.feed.ageMs === null ? null : vehiclesOnLine}
        vehiclesState={vehiclesFailed ? 'failed' : neverLoaded && vehiclesState.feed.state !== 'ready' ? 'loading' : 'ready'}
        city={city}
        onDirection={changeDirection}
        onStop={openLineStop}
        onClose={() => chooseLine(null)}
      />
    ) : null
  // Telefon bez karty, okolicy i linii: przegląd w arkuszu (`peek`; „Lista" rozwija go do `half`). Mapa liczy wtedy kadr
  // (`listOpen` w `TransitMap`) — z tego żyje podsumowanie. Szeroki ekran nie ma arkusza: lista i legenda zostają z boku.
  const overview = !isWide && card === null
  const overviewPanel = overview ? (
    <OverviewPanel
      listOpen={listOpen}
      items={visibleItems}
      overflow={visible?.overflow ?? false}
      // „Gotowe, ale bez pojazdów" (noc) to nie „wczytywanie": odróżnia je stan feedu z serwera.
      feed={{ state: vehiclesFailed ? 'failed' : neverLoaded && vehiclesState.feed.state !== 'ready' ? 'loading' : 'ready' }}
      onOpen={openVisible}
      onClearFilters={filterCount > 0 ? clearFilters : undefined}
    />
  ) : null
  // Nowy obiekt w arkuszu = nowy `key` → arkusz startuje znów w `peek` (przegląd z otwartą listą: w `half`).
  const cardKey =
    selection !== null
      ? `${selection.kind}:${selection.id}`
      : nearby !== null
        ? 'nearby'
        : overview
          ? listOpen
            ? 'overview:list'
            : 'overview'
          : listOpen
            ? 'list'
            : `line:${line?.routeId}`

  const search = <UnifiedSearch city={city} variant="overlay" lineSource={lineState} onSelect={onSearchPick} />

  function toggleList(): void {
    setListOpen((open) => !open)
    setSelection(null)
    setNearby(null)
  }

  // Chipy filtrów i statusy: pod kontrolkami, a gdy jest arkusz (telefon: zawsze, przegląd też) — na jego krawędzi
  // (`above`), bo przy half/full by je zakrył (role=status, decyzja z PR3).
  const sheetOpen = !isWide && (card !== null || overviewPanel !== null)
  // Insety kamery: dół tylko przy otwartym arkuszu (telefon; szeroki ekran ma panel obok mapy — kontener mapy już go wyłącza,
  // więc bez dodatkowego paddingu z prawej). Zamknięty arkusz = 0; `sheetInset` zostaje do następnego zgłoszenia.
  const bottomInset = sheetOpen ? sheetInset : 0
  const insets = useMemo(() => ({ top: topInset, bottom: bottomInset }), [topInset, bottomInset])
  // „Moja lokalizacja": z arkuszem jedzie w jego slocie `above` (peek go nie zakrywa), bez — przy prawej krawędzi mapy.
  const locateControl = (
    <LocateControl
      className={sheetOpen ? 'relative shrink-0' : 'absolute right-3 top-[144px] z-10'}
      messagesAbove={sheetOpen}
      buttonRef={locateButtonRef}
      onLocated={(point) => {
        if (!stillHere(city)) return
        // Fokus na przycisku (albo już zgubiony przy „Spróbuj ponownie") wróci tu po zamknięciu „W pobliżu".
        locateHadFocusRef.current = document.activeElement === locateButtonRef.current || document.activeElement === document.body
        showNearbyAt(point)
      }}
    />
  )

  const filterChips = (
    <ActiveFilterChips
      hidden={hidden}
      line={line}
      alertsOnly={alertsOnly}
      onClearLine={() => chooseLine(null)}
      onAlertsOnly={changeAlertsOnly}
      onHiddenChange={changeHidden}
      onClear={clearFilters}
    />
  )

  const notices = (
    <MapNotices
      noPosition={noPosition}
      onCloseNoPosition={() => setNoPosition(null)}
      needsLocation={nearbyPending && nearby === null && (userLocation.status === 'idle' || userLocation.status === 'ready')}
      onShowLocation={() => void showMyLocation()}
      shareStatus={shareStatus}
      problems={problems}
    />
  )

  return (
    // Wysokość = ekran bez nagłówka i dolnego paska (od `sm` obie zmienne to 0): strona się nie przewija.
    <div data-map-view="" className="flex h-[calc(100dvh-var(--header-h)-var(--bottom-nav-h))] min-w-0 flex-1 flex-col overflow-hidden">
      <div className="px-4 py-1 sm:px-8 sm:py-5">
        <TopBar
          city={city}
          compact
          title="Mapa transportu"
          subtitle={`${feed.name} · ${freshness}`}
          actions={<CityPicker compact cities={cities} current={city} hrefFor={(id) => `/city/${id}/map`} />}
        />
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {initialCamera !== null && (
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
              listOpen={listOpen || overview}
              insets={insets}
              onContextPoint={(point) => {
                setSelection(null)
                openNearbyAround(point)
              }}
              onVisibleChange={onVisibleChange}
              dark={resolvedTheme === 'dark'}
              onSelect={onMapSelect}
              onViewChange={recordView}
              onUserMove={() => {
                setFollowId(null)
                liftViewBlock()
              }}
            />
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col">
            {/* Nad arkuszem (`.bottom-sheet`, z-20) są wyniki i rozwinięte menu, nie samo puste pole wyszukiwania.
                Zwykłe kontrolki zostają pod panelem, aby nie zasłaniać jego uchwytu i statusów przy `full`. */}
            <div ref={toolbarRef} className="relative z-10 ml-3 mr-14 mt-3 flex shrink-0 flex-col gap-2 has-[[aria-expanded=true]:not([data-map-search-trigger])]:z-30 has-[[data-search-results]]:z-30 sm:ml-4 sm:mt-4">
              <MapToolbar
                isWide={isWide}
                search={search}
                hidden={hidden}
                vehicleLayers={vehicleLayers}
                onHiddenChange={changeHidden}
                alertsOnly={alertsOnly}
                onAlertsOnly={changeAlertsOnly}
                lineActive={line !== null}
                listOpen={listOpen}
                onToggleList={toggleList}
                pinnedPoints={pinnedPoints}
                onOpenPinned={openPinned}
                onShare={() => void share()}
              />

              {!sheetOpen && filterChips}
            </div>
            {/* Komunikaty chwilowe (toast udostępniania, błędy pobierania, brak pozycji) poza mierzonym paskiem: ich pojawienie się
                nie zmienia `insets.top`, więc nie przesuwa kamery. Szeroki ekran; na telefonie jadą w slocie `above` arkusza. */}
            {!sheetOpen && <div className="pointer-events-none relative z-10 ml-3 mr-14 mt-2 flex shrink-0 flex-col items-start gap-2 sm:ml-4">{notices}</div>}
          </div>

          {sheetOpen && (
            <BottomSheet
              key={cardKey}
              initialSnap={cardKey === 'overview:list' ? 'half' : 'peek'}
              onVisibleHeight={setSheetInset}
              above={
                // JEDEN rząd przy krawędzi arkusza: statusy po lewej (zajmują resztę szerokości i zawijają tekst), „Moja lokalizacja" po prawej,
                // oba przy dolnej krawędzi. Dwa rzędy jeden nad drugim (PR10 T5) wypychały trwały komunikat pod nagłówek strony przy `full`
                // (nad arkuszem ~55 px), a przycisk w rzędzie z nim zostaje widoczny także przy peek/half. `!`: sam rząd nie łapie gestów mapy.
                <div className="pointer-events-none! flex w-full items-end justify-between gap-2">
                  <div className="pointer-events-none flex min-w-0 flex-1 flex-col items-start gap-1.5">
                    {filterChips}
                    {notices}
                    {outsideFeed && (
                      <p role="status" className="glass-strong pointer-events-auto rounded-full px-4 py-1.5 text-xs text-text-secondary">
                        Przystanki i pojazdy miejskie: tylko {feed.name} i okolice
                      </p>
                    )}
                  </div>
                  {locateControl}
                </div>
              }
            >
              {card ?? overviewPanel}
            </BottomSheet>
          )}

          <p className="sr-only" aria-live="polite">
            {vehicleCountAnnouncement}
          </p>

          {/* Szeroki ekran: pozycja związana z `top-[200px]` wrappera legendy niżej — przesuwasz przycisk (albo „Moja lokalizacja"), przesuń legendę. */}
          <button
            type="button"
            onClick={() => flyTo(feed.mapCenter.lat, feed.mapCenter.lon, MAP_ZOOM.initial)}
            aria-label={`Pokaż całe miasto — ${feed.name}`}
            title="Pokaż całe miasto"
            className="glass-chrome border border-surface-border shadow-md absolute right-3 top-[88px] z-10 grid h-11 w-11 place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <CityIcon size={ICON_SIZE.tile} />
          </button>

          {/* Szeroki ekran: 144 px = pod „Pokaż całe miasto" (132 px) + 12 px; komunikaty wysuwają się w lewo od przycisku.
              Telefon: przycisk leży w slocie `above` arkusza (wyżej), nie tu. */}
          {!sheetOpen && locateControl}

          {outsideFeed && !sheetOpen && (
            <p role="status" className="glass-strong absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-xs text-text-secondary">
              Przystanki i pojazdy miejskie: tylko {feed.name} i okolice
            </p>
          )}

          {isWide && (
            // Pełna legenda tylko na szerokim ekranie (telefon: `CompactLegend` w arkuszu przeglądu). `top-[200px]` =
            // pod kontrolkami prawego rogu: zoom MapLibre (10–68 px), „Pokaż całe miasto” (`top-[88px]` + `h-11` =
            // 132 px) i „Moja lokalizacja” (`top-[144px]` + `h-11` = 188 px) + 12 px odstępu. Od `top-3` rozwinięta
            // legenda przykrywała je na niskich ekranach (800×600).
            <div className="pointer-events-none absolute bottom-8 right-3 top-[200px] z-10 flex flex-col justify-end sm:right-4">
              <MapLegend />
            </div>
          )}

        </div>

        {isWide && card !== null && <aside className="flex w-aside shrink-0 flex-col py-3 pr-3 pl-3" aria-label="Wybrany obiekt">{card}</aside>}
      </div>
    </div>
  )
}
