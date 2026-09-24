'use client'

import { useEffect, useRef, type RefObject } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import type { Root } from 'react-dom/client'
import { HEX_COLOR, STYLE_URL, WORKER_URL, createMarkerElement, buildPopupContent } from './MapView'
import { MODE_LABEL } from './transitMode'
import { railMarkerBackground, type RailStationPin } from '@/lib/board/railStationPin'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'

const GRAY_FALLBACK = '#9ca3af'
/** Wygaszanie zaczyna się w tej sekundzie wieku pozycji, kończy (ukrycie) w `HIDE_AFTER_SEC`. */
const FADE_START_SEC = 90
const HIDE_AFTER_SEC = 180
const SOURCE_ID = 'city-vehicles'
const LAYER_ID = 'city-vehicles-circles'
const FIT_PADDING = 40
/** Minimalna wysokość pola kadru — bez niej MapLibre odmawia fitBounds i kamera zostaje na [0,0]. */
const MIN_FIT_HEIGHT = 80

type VehicleFeatureCollection = {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { id: string; color: string; opacity: number }
  }[]
}

/** Pozycje starsze niż `HIDE_AFTER_SEC` znikają z warstwy (AGENTS #7 nie dotyczy — to nie "brak danych", to martwa pozycja). */
function toFeatureCollection(vehicles: CityVehicle[]): VehicleFeatureCollection {
  const features: VehicleFeatureCollection['features'] = []
  for (const v of vehicles) {
    if (v.ageSec > HIDE_AFTER_SEC) continue
    const opacity = v.ageSec <= FADE_START_SEC ? 1 : 1 - (v.ageSec - FADE_START_SEC) / (HIDE_AFTER_SEC - FADE_START_SEC)
    const color = v.color !== null && HEX_COLOR.test(v.color) ? v.color : GRAY_FALLBACK
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      properties: { id: v.id, color, opacity },
    })
  }
  return { type: 'FeatureCollection', features }
}

function ageLabel(ageSec: number): string {
  return ageSec < 60 ? `${ageSec} s temu` : `${Math.round(ageSec / 60)} min temu`
}

/**
 * Treść popupu przez DOM API, nie `setHTML(string)` — jak `MapView.buildPopupContent`
 * (AGENTS #4). `city`/`v` pochodzą z GTFS, zaufane wewnątrz procesu, ale konwencja
 * ta sama w całym module map.
 */
function buildVehiclePopupContent(v: CityVehicle, city: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'text-sm'

  const title = document.createElement('div')
  title.className = 'flex items-center gap-2 font-semibold text-foreground'
  if (v.color !== null && HEX_COLOR.test(v.color)) {
    const dot = document.createElement('span')
    dot.className = 'inline-block h-2.5 w-2.5 shrink-0 rounded-full'
    dot.style.background = v.color
    title.appendChild(dot)
  }
  const lineText = document.createElement('span')
  lineText.textContent = v.shortName ?? 'linia nieznana'
  title.appendChild(lineText)
  wrap.appendChild(title)

  const sub = document.createElement('div')
  sub.className = 'mt-1 text-xs text-text-secondary'
  sub.textContent = v.headsign ?? (v.mode !== null ? MODE_LABEL[v.mode] : 'kierunek nieznany')
  wrap.appendChild(sub)

  const meta = document.createElement('div')
  meta.className = 'text-xs text-text-muted'
  meta.textContent = `Nr boczny ${v.sideNumber !== '' ? v.sideNumber : '—'} · ${ageLabel(v.ageSec)}`
  wrap.appendChild(meta)

  if (v.routeId !== null) {
    const link = document.createElement('a')
    link.href = `/city/${city}/line/${v.routeId}`
    link.textContent = 'Zobacz linię →'
    link.className = 'mt-1.5 block text-xs font-medium text-indigo-600 dark:text-indigo-400'
    wrap.appendChild(link)
  } else {
    const note = document.createElement('div')
    note.className = 'mt-1.5 text-xs text-text-muted'
    note.textContent = 'Brak przypisania do linii'
    wrap.appendChild(note)
  }

  return wrap
}

/**
 * Dodaje/aktualizuje/usuwa markery stacji na już zamontowanej mapie — ten sam
 * wzorzec co `syncMovers` w `MapView.tsx` (diff po `id`, update w miejscu
 * zamiast przebudowy), tylko bez ruchu (stacje nie zmieniają pozycji).
 */
function syncRailMarkers(
  mapInstance: MapLibreMap,
  lib: typeof import('maplibre-gl'),
  stations: RailStationPin[],
  markers: Map<string, { marker: MapLibreMarker; root: Root }>
): void {
  const seen = new Set<string>()
  for (const pin of stations) {
    seen.add(pin.id)
    const existing = markers.get(pin.id)
    if (existing !== undefined) {
      existing.marker.getPopup()?.setDOMContent(buildPopupContent(pin, true))
      continue
    }
    const { element, root } = createMarkerElement(pin, railMarkerBackground(pin))
    if (pin.coordSource === 'city-fallback') {
      element.style.outlineStyle = 'dashed'
      element.style.outlineColor = 'white'
      element.style.outlineWidth = '2px'
      element.style.outlineOffset = '2px'
    }
    const marker = new lib.Marker({ element })
      .setLngLat([pin.lon, pin.lat])
      .setPopup(new lib.Popup({ offset: 16 }).setDOMContent(buildPopupContent(pin, true)))
      .addTo(mapInstance)
    markers.set(pin.id, { marker, root })
  }
  for (const [id, entry] of markers) {
    if (seen.has(id)) continue
    entry.marker.remove()
    entry.root.unmount()
    markers.delete(id)
  }
}

/**
 * Mapa miasta live: WSZYSTKIE pojazdy jako warstwa GeoJSON `circle`, nie
 * `Marker` DOM — przy ~1000+ punktach `Marker` (jeden element DOM na pojazd)
 * to znany antywzorzec MapLibre. Montuje się RAZ przy pierwszej niepustej
 * liście (kamera dopasowana do tamtego zestawu); kolejne polle tylko
 * `source.setData()`, bez przemontowania mapy — inaczej każdy tick pollera
 * (15 s) resetowałby zoom/pan użytkownika (ten sam problem co `pinsKey` w
 * `MapView.tsx`, AGENTS #6). Zmiana miasta = `key={city}` w wywołującym
 * (`page.tsx`), nie logika tutaj.
 */
export function CityVehicleMap({
  vehicles,
  railStations,
  city,
  ariaLabel,
  topOverlayRef,
}: {
  vehicles: CityVehicle[]
  railStations?: RailStationPin[]
  city: string
  ariaLabel: string
  /**
   * Pasek sterowania leżący na mapie (`absolute`). Kadr początkowy rezerwuje u góry
   * jego faktyczną, zmierzoną wysokość — na wąskim ekranie pasek składa się w kolumnę
   * i płaskie 40 px zostawiało piny pod nim, nieklikalne.
   */
  topOverlayRef?: RefObject<HTMLElement | null>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const vehiclesRef = useRef<Map<string, CityVehicle>>(new Map())
  const railMarkersRef = useRef<Map<string, { marker: MapLibreMarker; root: Root }>>(new Map())
  const railStationsRef = useRef<RailStationPin[]>(railStations ?? [])

  useEffect(() => {
    if (containerRef.current === null || vehicles.length === 0) return
    let cancelled = false
    let map: MapLibreMap | null = null

    import('maplibre-gl').then((lib) => {
      if (cancelled || containerRef.current === null) return
      lib.setWorkerUrl(WORKER_URL)

      const bounds = new lib.LngLatBounds()
      for (const v of vehicles) bounds.extend([v.lon, v.lat])
      for (const pin of railStationsRef.current) bounds.extend([pin.lon, pin.lat])

      const box = containerRef.current.getBoundingClientRect()
      const overlay = topOverlayRef?.current
      const overlayBottom = overlay ? overlay.getBoundingClientRect().bottom - box.top : 0
      const top = Math.max(FIT_PADDING, Math.min(overlayBottom + FIT_PADDING, box.height - FIT_PADDING - MIN_FIT_HEIGHT))
      const padding = { top, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING }

      map = new lib.Map({ container: containerRef.current, style: STYLE_URL, bounds, fitBoundsOptions: { padding, maxZoom: 15 } })
      mapRef.current = map
      const mapInstance = map

      const addLayer = (): void => {
        if (mapInstance.getSource(SOURCE_ID) !== undefined) return
        mapInstance.addSource(SOURCE_ID, { type: 'geojson', data: toFeatureCollection(vehicles) })
        mapInstance.addLayer({
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 6,
            'circle-color': ['get', 'color'],
            'circle-opacity': ['get', 'opacity'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
          },
        })
        mapInstance.on('click', LAYER_ID, (e) => {
          const id = e.features?.[0]?.properties?.id
          const clicked = typeof id === 'string' ? vehiclesRef.current.get(id) : undefined
          if (clicked === undefined) return
          new lib.Popup({ offset: 10 }).setLngLat(e.lngLat).setDOMContent(buildVehiclePopupContent(clicked, city)).addTo(mapInstance)
        })
        mapInstance.on('mouseenter', LAYER_ID, () => {
          mapInstance.getCanvas().style.cursor = 'pointer'
        })
        mapInstance.on('mouseleave', LAYER_ID, () => {
          mapInstance.getCanvas().style.cursor = ''
        })
        syncRailMarkers(mapInstance, lib, railStationsRef.current, railMarkersRef.current)
      }
      if (mapInstance.isStyleLoaded()) addLayer()
      else mapInstance.once('load', addLayer)
    })

    return () => {
      cancelled = true
      mapRef.current = null
      for (const { marker, root } of railMarkersRef.current.values()) {
        marker.remove()
        root.unmount()
      }
      railMarkersRef.current.clear()
      map?.remove()
    }
    // Montowanie RAZ (pierwsza niepusta lista) -- patrz komentarz nad komponentem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    vehiclesRef.current = new Map(vehicles.map((v) => [v.id, v]))
    const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(toFeatureCollection(vehicles))
  }, [vehicles])

  const railStationsKey = (railStations ?? [])
    .map((pin) => `${pin.id}:${pin.status ?? ''}:${pin.coordSource}:${(pin.preview ?? []).join(',')}`)
    .join('|')

  useEffect(() => {
    railStationsRef.current = railStations ?? []
    const mapInstance = mapRef.current
    if (mapInstance === null) return
    import('maplibre-gl').then((lib) => {
      syncRailMarkers(mapInstance, lib, railStationsRef.current, railMarkersRef.current)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `railStationsKey` to celowa sygnatura treści `railStations`.
  }, [railStationsKey])

  // Zewnętrzny `absolute inset-0` (nie `h-full w-full` na samym kontenerze):
  // rodzic (`page.tsx`, `relative min-h-[60vh] flex-1`) ma wysokość rozwiązaną
  // przez flex-grow, nie jawną długość -- procentowa wysokość dziecka przez
  // taki łańcuch bywa `0` w Chromium na wąskim viewporcie (kolumna `flex-col`
  // w `(app)/layout.tsx` na telefonie; rząd `flex-row` desktopu maskował to
  // przez `align-items: stretch`). Wewnętrzny kontener MUSI zostać `h-full
  // w-full`, nie `absolute inset-0` -- MapLibre dokleja mu klasę
  // `maplibregl-map`, a `maplibre-gl.css` (`globals.css`, import BEZ
  // `@layer`) wygrywa specyficznością nad warstwowanym Tailwindem i nadpisuje
  // `position: relative`, gubiąc nasze `inset-0`.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} role="region" aria-label={ariaLabel} className="h-full w-full" />
    </div>
  )
}
