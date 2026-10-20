'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { LOCATION_MAX_AGE_MS } from '@/components/UserLocationProvider'
import { formatAt, isNearViewPoint, parseAt, type MapCamera } from '@/components/map/mapCamera'
import { MAP_ZOOM } from '@/components/map/mapData'
import type { MapView } from '@/components/map/TransitMap'
import { useUserLocation, type UserPoint } from '@/hooks/useUserLocation'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'

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

/**
 * Kamera mapy transportu: kadr startowy (`?nearby=1` > `?at=` > ostatni widok > centrum miasta), zapis kadru z regułą
 * prywatności (adr/0012, #4) i „okolica" z pozycji GPS. `clearSelection` — okolica zamyka kartę wybranego obiektu.
 */
export function useMapCamera({ city, mapCenter, clearSelection }: { city: string; mapCenter: { lat: number; lon: number }; clearSelection: () => void }) {
  const userLocation = useUserLocation()
  const [initialCamera, setInitialCamera] = useState<MapCamera | null>(null)
  const [view, setView] = useState<MapView | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lon: number; nonce: number; zoom?: number } | null>(null)
  const [nearby, setNearby] = useState<{ lat: number; lon: number } | null>(null)
  // Okolica z pozycji GPS: wiersze zostają, ale podgląd odjazdów (id przystanków w żądaniu) i zdejmowanie blokady widoku — nie (adr/0012).
  const [nearbyFromGps, setNearbyFromGps] = useState(false)
  // `?nearby=1` bez gotowej pozycji (np. po F5): czeka na kliknięcie, GPS sam się nie uruchamia (adr/0012).
  const [nearbyPending, setNearbyPending] = useState(false)
  const entryRef = useRef<{ flag: boolean; here: UserPoint | null } | null>(null)
  // Pozycja z GPS może dojść po opuszczeniu strony albo zmianie miasta — wtedy nie wolno dotykać URL-a ani stanu (M6).
  const aliveRef = useRef({ mounted: true, city })
  useEffect(() => {
    const alive = aliveRef.current // obiekt, nie węzeł DOM: ten sam przez cały czas życia strony
    alive.mounted = true
    alive.city = city
    return () => {
      alive.mounted = false
    }
  }, [city])
  // Ostatni punkt z providera (także ustalony na innej stronie): reguła prywatności widoku nie zna tylko `locatedViewRef` (M2).
  const userPointRef = useRef(userLocation.point)
  useEffect(() => {
    userPointRef.current = userLocation.point
  }, [userLocation.point])
  // Ostatnia pozycja GPS użytkownika (tylko w pamięci) i zatrzask. Kadr w pobliżu niej NIE trafia do `?at=` ani do localStorage
  // (adr/0012, #4) — zapis blokuje którekolwiek: (a) zatrzask ustawiony przy „Mojej lokalizacji" (zoom kółkiem/szczypnięciem/klawiaturą
  // i strzałki przesuwają środek bez `dragstart`), (b) środek kadru w promieniu `PRIVACY_RADIUS_PX` od punktu. Zatrzask zdejmuje WYŁĄCZNIE
  // przeciągnięcie albo świadomy ruch programowy (`liftViewBlock`), nigdy `moveend` (spóźnione `moveend` z przerwanej animacji
  // odblokowałoby zapis dolotu do użytkownika); promień zostaje zawsze (powrót w pobliże użytkownika).
  const locatedViewRef = useRef<{ lat: number; lon: number; latched: boolean } | null>(null)
  const liftViewBlock = useCallback((): void => {
    if (locatedViewRef.current !== null) locatedViewRef.current.latched = false
  }, [])

  const consumeNearbyFlag = (): void => {
    if (!nearbyPending) return
    setNearbyPending(false)
    patchUrlParams({ nearby: null })
  }

  /** Każde otwarcie okolicy zużywa `?nearby=1`, żeby przycisk „Pokaż moją lokalizację" nie wracał po jej zamknięciu. */
  function openNearbyAround(point: { lat: number; lon: number }, fromGps = false): void {
    setNearby({ lat: point.lat, lon: point.lon })
    setNearbyFromGps(fromGps)
    consumeNearbyFlag()
  }

  /** `keepBlock`: skupienie z okolicy z GPS — widok nadal wynika z pozycji użytkownika, więc blokada zapisu zostaje (zdejmuje ją przeciągnięcie). */
  function focusOn(lat: number, lon: number, keepBlock = false): void {
    if (!keepBlock) liftViewBlock()
    setFocus({ lat, lon, nonce: Date.now() })
  }

  /** Kadr na dane współrzędne i zoom (np. „Pokaż całe miasto"); świadomy ruch, więc zdejmuje blokadę zapisu. */
  function flyTo(lat: number, lon: number, zoom: number): void {
    liftViewBlock()
    setFocus({ lat, lon, zoom, nonce: Date.now() })
  }

  /** Okolica wokół pozycji użytkownika (przycisk „Moja lokalizacja", `?nearby=1`); współrzędne zostają w stanie strony, nie w URL-u ani w localStorage. */
  function showNearbyAt(point: { lat: number; lon: number }, fly = true): void {
    clearSelection()
    openNearbyAround(point, true)
    if (fly) focusOn(point.lat, point.lon)
    locatedViewRef.current = { lat: point.lat, lon: point.lon, latched: true }
    // Ewentualne `?at=` (np. z linku) mogło już zawierać tę pozycję — usuwamy je razem z kadrem.
    patchUrlParams({ at: null })
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

  useEffect(() => {
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
    } else if (flag) {
      setNearbyPending(true)
    }
    // Kadr: pozycja z `?nearby=1` > link `?at=` > ostatni widok w tej przeglądarce > centrum miasta.
    setInitialCamera(here !== null ? { lat: here.lat, lon: here.lon, zoom: MAP_ZOOM.focus } : (parseAt(readUrlParam('at')) ?? readLastView(city) ?? { ...mapCenter, zoom: MAP_ZOOM.initial }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- odtworzenie raz, przy wejściu
  }, [])

  // Odmowa/błąd z przycisku „Moja lokalizacja" (nie z komunikatu) też zużywa `?nearby=1`: przycisk komunikatu nic by już nie dał (M5).
  const locationFailed = userLocation.status === 'denied' || userLocation.status === 'unavailable' || userLocation.status === 'error'
  useEffect(() => {
    if (!locationFailed || !nearbyPending) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reakcja na zewnętrzny stan (providera), flaga to też URL
    setNearbyPending(false)
    patchUrlParams({ nearby: null })
  }, [locationFailed, nearbyPending])

  const recordView = useCallback(
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

  return {
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
  }
}
