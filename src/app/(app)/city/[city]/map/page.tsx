'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { z } from 'zod'
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
import { ActiveFilterChips, MapToolbar, NoPositionNotice } from '@/components/map/MapToolbar'
import { TransitMap, type MapHit, type MapView } from '@/components/map/TransitMap'
import {
  HIDE_AFTER_SEC,
  MAP_ZOOM,
  VEHICLE_LAYERS,
  activeFilterCount,
  boundsContain,
  formatAt,
  isNearViewPoint,
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
import { useCityLines } from '@/hooks/useCityLines'
import { useCityStops } from '@/hooks/useCityStops'
import type { CityStop } from '@/lib/gtfs/query'
import { useCityVehicles } from '@/hooks/useCityVehicles'
import { pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { useLineDetail } from '@/hooks/useLineDetail'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import { useRailStations } from '@/hooks/useRailStations'
import { useShareUrl } from '@/hooks/useShareUrl'
import { LOCATION_MAX_AGE_MS } from '@/components/UserLocationProvider'
import { useUserLocation, type UserPoint } from '@/hooks/useUserLocation'
import { discoveryHref, type DiscoveryResult } from '@/lib/discovery'
import { formatAgo } from '@/lib/format'
import { getCity } from '@/lib/gtfs/cities'
import type { BackboneLine, LineListEntry, LineRouteStop } from '@/lib/gtfs/query'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'
import { lineColor } from '@/components/transitMode'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'

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


/** Zaznaczenie przystanku z listy przystanków miasta (jedno miejsce zamiast kilku kopii literału). */
function stopSelection(stop: CityStop): Extract<MapSelection, { kind: 'stop' }> {
  return { kind: 'stop', id: stop.id, groupId: stop.groupId, name: stop.name, code: stop.code, mode: stop.mode, lat: stop.lat, lon: stop.lon }
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
  // Wynik wyszukiwarki bez pozycji na mapie: komunikat z linkiem do szczegółów (kamera się nie rusza).
  const [noPosition, setNoPosition] = useState<{ name: string; href: string | null; linkLabel: string } | null>(null)
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()
  // Szeroki ekran (panel obok mapy) vs telefon (arkusz od dołu). Na serwerze: telefon.
  const isWide = useMediaQuery(SM_UP, false)

  const vehiclesState = useCityVehicles(city)
  const stopsState = useCityStops(city)
  const railState = useRailStations()
  // Jedno pobranie katalogu linii: zasila stronę i (jako `lineSource`) wyszukiwarkę — ten sam ranking `rankLines`.
  const lineState = useCityLines(city)
  const lines = lineState.lines
  const backbone = useCityList<BackboneLine>(`/api/gtfs/backbone?city=${encodeURIComponent(city)}`, (json) => json.lines as BackboneLine[] | null)
  const [initialCamera, setInitialCamera] = useState<MapCamera | null>(null)
  const [followId, setFollowId] = useState<string | null>(null)
  const { share, status: shareStatus } = useShareUrl()
  const { pinnedItems, loaded: pinsLoaded, addPinned, removePinned, replacePinned, isPinned } = usePinned()
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [nearby, setNearby] = useState<{ lat: number; lon: number } | null>(null)
  // Okolica z pozycji GPS: wiersze zostają, ale podgląd odjazdów (id przystanków w żądaniu) i zdejmowanie blokady widoku — nie (adr/0012).
  const [nearbyFromGps, setNearbyFromGps] = useState(false)
  // `?nearby=1` bez gotowej pozycji (np. po F5): czeka na kliknięcie, GPS sam się nie uruchamia (adr/0012).
  const [nearbyPending, setNearbyPending] = useState(false)
  const userLocation = useUserLocation()
  const entryRef = useRef<{ flag: boolean; here: UserPoint | null } | null>(null)
  // Pozycja z GPS może dojść po opuszczeniu strony albo zmianie miasta — wtedy nie wolno dotykać URL-a ani stanu (M6).
  const aliveRef = useRef({ mounted: true, city })
  aliveRef.current.city = city
  useEffect(() => {
    const alive = aliveRef.current // obiekt, nie węzeł DOM: ten sam przez cały czas życia strony
    alive.mounted = true
    return () => {
      alive.mounted = false
    }
  }, [])
  // Ostatni punkt z providera (także ustalony na innej stronie): reguła prywatności widoku nie zna tylko `locatedViewRef` (M2).
  const userPointRef = useRef(userLocation.point)
  userPointRef.current = userLocation.point
  // Ostatnia pozycja GPS użytkownika (tylko w pamięci) i zatrzask. Kadr w pobliżu niej NIE trafia do `?at=` ani do localStorage
  // (adr/0012, #4) — zapis blokuje którekolwiek: (a) zatrzask ustawiony przy „Mojej lokalizacji" (zoom kółkiem/szczypnięciem/klawiaturą
  // i strzałki przesuwają środek bez `dragstart`), (b) środek kadru w promieniu `PRIVACY_RADIUS_PX` od punktu. Zatrzask zdejmuje WYŁĄCZNIE
  // przeciągnięcie albo świadomy ruch programowy (`liftViewBlock`), nigdy `moveend` (spóźnione `moveend` z przerwanej animacji
  // odblokowałoby zapis dolotu do użytkownika); promień zostaje zawsze (powrót w pobliże użytkownika).
  const locatedViewRef = useRef<{ lat: number; lon: number; latched: boolean } | null>(null)
  const liftViewBlock = (): void => {
    if (locatedViewRef.current !== null) locatedViewRef.current.latched = false
  }
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
    const line = readUrlParam('line')
    setRouteParam(line !== null && GTFS_ROUTE_ID_PATTERN.test(line) ? line : null)
    setDirectionId(readUrlParam('dir') === '1' ? 1 : 0)
    setAlertsOnly(readUrlParam('alerts') === '1')
    // `?nearby=1`: świeża (< `maximumAge`) pozycja z providera otwiera okolicę i zużywa flagę; bez niej (F5, stara pozycja)
    // NIE pytamy o GPS — strona pokazuje przycisk (adr/0012). Mapa tworzy się asynchronicznie, więc
    // „skupienie" to kadr startowy na punkcie, a nie `focus` (ten przepadłby przed powstaniem mapy).
    // Wejście liczymy raz (ref): StrictMode odpala ten efekt dwa razy, a pierwszy przebieg zużywa flagę w URL-u.
    const freshPoint = userLocation.fixAt !== null && Date.now() - userLocation.fixAt < LOCATION_MAX_AGE_MS ? userLocation.point : null
    entryRef.current ??= { flag: readUrlParam('nearby') === '1', here: readUrlParam('nearby') === '1' ? freshPoint : null }
    const { flag, here } = entryRef.current
    if (here !== null) {
      showNearbyAt(here, false)
      patchUrlParams({ nearby: null })
    } else if (flag) setNearbyPending(true)
    // Kadr: pozycja z `?nearby=1` > link `?at=` > ostatni widok w tej przeglądarce > centrum miasta.
    setInitialCamera(
      here !== null ? { lat: here.lat, lon: here.lon, zoom: MAP_ZOOM.focus } : (parseAt(readUrlParam('at')) ?? readLastView(city) ?? { ...feed.mapCenter, zoom: MAP_ZOOM.initial })
    )
    setMounted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- odtworzenie raz, przy wejściu
  }, [])

  useEffect(() => {
    if (nearby !== null) return
    if (refocusLocateRef.current) locateButtonRef.current?.focus({ preventScroll: true })
    refocusLocateRef.current = false
    locateHadFocusRef.current = false
  }, [nearby])

  // Odmowa/błąd z przycisku „Moja lokalizacja" (nie z komunikatu) też zużywa `?nearby=1`: przycisk komunikatu nic by już nie dał (M5).
  const locationFailed = userLocation.status === 'denied' || userLocation.status === 'unavailable' || userLocation.status === 'error'
  useEffect(() => {
    if (!locationFailed || !nearbyPending) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reakcja na zewnętrzny stan (providera), flaga to też URL
    setNearbyPending(false)
    patchUrlParams({ nearby: null })
  }, [locationFailed, nearbyPending])

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

  const onViewChange = useCallback(
    (next: MapView) => {
      setView(next)
      // Promień sprawdzamy wobec obu punktów: z tej strony („Moja lokalizacja") i z providera (ustalonego np. na innej stronie).
      const here = locatedViewRef.current
      if (here?.latched || [here, userPointRef.current].some((p) => p !== null && isNearViewPoint(next.center, next.zoom, p))) return
      const at = formatAt({ ...next.center, zoom: next.zoom })
      patchUrlParams({ at })
      saveLastView(city, at)
    },
    [city]
  )

  // Mapa zgłasza kadr po KAŻDYM `idle` (na telefonie zawsze); ten sam skład to ten sam stan — bez ponownego renderu całej strony.
  const onVisibleChange = useCallback((items: VisibleItem[], overflow: boolean) => {
    setVisible((prev) =>
      prev !== null && prev.overflow === overflow && prev.items.length === items.length && prev.items.every((item, i) => item.kind === items[i].kind && item.id === items[i].id && item.label === items[i].label)
        ? prev
        : { items, overflow }
    )
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

  /** `keepBlock`: skupienie z okolicy z GPS — widok nadal wynika z pozycji użytkownika, więc blokada zapisu zostaje (zdejmuje ją przeciągnięcie). */
  function focusOn(lat: number, lon: number, keepBlock = false): void {
    if (!keepBlock) liftViewBlock()
    setFocus({ lat, lon, nonce: Date.now() })
  }

  /** Okolica wokół pozycji użytkownika (przycisk „Moja lokalizacja", `?nearby=1`); współrzędne zostają w stanie strony, nie w URL-u ani w localStorage. */
  function showNearbyAt(point: { lat: number; lon: number }, fly = true): void {
    setSelection(null)
    openNearbyAround(point, true)
    if (fly) focusOn(point.lat, point.lon)
    locatedViewRef.current = { lat: point.lat, lon: point.lon, latched: true }
    // Ewentualne `?at=` (np. z linku) mogło już zawierać tę pozycję — usuwamy je razem z kadrem.
    patchUrlParams({ at: null })
  }

  /** Każde otwarcie okolicy zużywa `?nearby=1`, żeby przycisk „Pokaż moją lokalizację" nie wracał po jej zamknięciu. */
  function openNearbyAround(point: { lat: number; lon: number }, fromGps = false): void {
    setNearby({ lat: point.lat, lon: point.lon })
    setNearbyFromGps(fromGps)
    consumeNearbyFlag()
  }

  /** Strona żyje jeszcze w tym samym mieście — odpowiedź GPS po wyjściu z mapy nie rusza URL-a nowej strony. */
  const stillHere = (forCity: string): boolean => aliveRef.current.mounted && aliveRef.current.city === forCity

  async function showMyLocation(): Promise<void> {
    const asked = city
    const point = await userLocation.request()
    if (!stillHere(asked)) return
    consumeNearbyFlag()
    if (point !== null) showNearbyAt(point)
  }

  function consumeNearbyFlag(): void {
    if (!nearbyPending) return
    setNearbyPending(false)
    patchUrlParams({ nearby: null })
  }

  /** „×"/Escape w „W pobliżu": arkusz przemontował się przy otwarciu, więc stary przycisk lokalizacji nie istnieje — fokus wraca na nowy. */
  function closeNearby(): void {
    refocusLocateRef.current = locateHadFocusRef.current
    setNearby(null)
  }

  function openNearby(point: NearbyPoint): void {
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

  /** Wybór z wyszukiwarki: nigdy nie wychodzi z mapy; bez pozycji kamera stoi (nigdy 0,0), a komunikat linkuje do szczegółów. */
  function onSearchPick(result: DiscoveryResult): void {
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
  const freshness =
    neverLoaded && !vehiclesFailed
      ? 'wczytywanie pozycji pojazdów…'
      : neverLoaded
        ? 'nie udało się pobrać pozycji pojazdów'
        : vehiclesFailed
          ? 'pozycje pojazdów nieaktualne — pokazujemy ostatnie dostępne'
          : vehiclesState.lastSuccessAt !== null
            ? // Kiedy PRZEGLĄDARKA pobrała odczyt (rośnie z zegarem) — wiek GPS pojazdów jest osobno („Pozycje sprzed", ui-copy.md).
              `pobrano ${formatAgo(Math.round((vehiclesState.now - vehiclesState.lastSuccessAt) / 1000))}`
            : 'pozycje pojazdów na żywo'

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
  useEffect(() => {
    if (routeKey !== null || following) liftViewBlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `liftViewBlock` czyta tylko ref
  }, [routeKey, following])
  const card =
    selection !== null ? (
      <MapCard
        key={`${selection.kind}:${selection.id}`}
        selection={selection}
        vehicle={selectedVehicle}
        city={city}
        onClose={() => {
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
        vehiclesOnLine={vehiclesOnLine}
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
    <>
      {noPosition !== null && <NoPositionNotice notice={noPosition} onClose={() => setNoPosition(null)} />}
      {nearbyPending && nearby === null && (userLocation.status === 'idle' || userLocation.status === 'ready') && (
        <div role="status" className="glass-strong pointer-events-auto flex w-max max-w-full flex-wrap items-center gap-x-3 rounded-xl px-3 py-1.5 text-sm">
          <span>Okolica wymaga Twojej lokalizacji.</span>
          <button type="button" onClick={() => void showMyLocation()} className="touch-44 relative min-h-9 font-medium text-primary-text underline underline-offset-2">
            Pokaż moją lokalizację
          </button>
        </div>
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
    </>
  )

  return (
    // Wysokość = ekran bez nagłówka i dolnego paska (od `sm` obie zmienne to 0): strona się nie przewija.
    <div data-map-view="" className="flex h-[calc(100dvh-var(--header-h)-var(--bottom-nav-h))] min-w-0 flex-1 flex-col overflow-hidden">
      <div className="px-4 py-1 sm:px-8 sm:py-5">
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
              listOpen={listOpen || overview}
              insets={insets}
              onContextPoint={(point) => {
                setSelection(null)
                openNearbyAround(point)
              }}
              onVisibleChange={onVisibleChange}
              dark={resolvedTheme === 'dark'}
              onSelect={onMapSelect}
              onViewChange={onViewChange}
              onUserMove={() => {
                setFollowId(null)
                liftViewBlock()
              }}
            />
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col">
            {/* Nad arkuszem (`.bottom-sheet`, z-20) tylko wtedy, gdy coś tu jest rozwinięte (wyniki wyszukiwania,
                Filtry, Przypięte, Więcej) — inaczej lista otwierała się pod panelem; zwinięte zostają pod nim. */}
            <div ref={toolbarRef} className="relative z-10 ml-3 mr-14 mt-3 flex shrink-0 flex-col gap-2 has-[[aria-expanded=true]]:z-30 has-[[data-search-results]]:z-30 sm:ml-4 sm:mt-4">
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
            onClick={() => {
              liftViewBlock()
              setFocus({ ...feed.mapCenter, zoom: MAP_ZOOM.initial, nonce: Date.now() })
            }}
            aria-label={`Pokaż całe miasto — ${feed.name}`}
            title="Pokaż całe miasto"
            className="glass absolute right-3 top-[88px] z-10 grid h-11 w-11 place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
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
