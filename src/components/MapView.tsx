'use client'

import { useEffect, useRef } from 'react'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'

export type MapPin = { id: string; lat: number; lon: number; label: string }

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/**
 * Mapa pinów — tępy komponent, nie wie nic o GTFS ani PKP (AGENTS.md #13:
 * domeny się nie mieszają). `maplibre-gl` ładowany dynamicznie w efekcie, nie
 * statycznym importem — biblioteka dotyka `window` przy inicjalizacji, więc
 * statyczny import wysadziłby SSR; dynamiczny jednocześnie code-splituje
 * bundle, więc nie trzeba osobno `next/dynamic`.
 *
 * Kontrolka atrybucji MapLibre zostaje włączona — wymóg licencji ODbL/OSM
 * danych OpenFreeMap.
 */
export function MapView({
  pins,
  onPinClick,
  ariaLabel,
}: {
  pins: MapPin[]
  onPinClick?: (id: string) => void
  ariaLabel: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Sygnatura treści, nie referencji: wołający (np. `TransitStopDetail`) przelicza
  // `pins` na nowo przy każdym pollu tablicy (~30 s) nawet gdy słupki się nie
  // zmieniły -- pełna tablica w dep array przeinicjalizowywałaby mapę (reset
  // zoomu/pana) co poll. Efekt niżej celowo zamyka się nad `pins` z bieżącego
  // renderu zamiast dodawać je do zależności: uruchamia się tylko, gdy ta
  // sygnatura faktycznie się zmieni, więc treść w domknięciu jest wtedy aktualna.
  const pinsKey = pins.map((p) => `${p.id}:${p.lat}:${p.lon}:${p.label}`).join('|')

  useEffect(() => {
    if (containerRef.current === null || pins.length === 0) return

    let cancelled = false
    let map: MapLibreMap | null = null
    const markers: MapLibreMarker[] = []

    import('maplibre-gl').then((lib) => {
      if (cancelled || containerRef.current === null) return

      map = new lib.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [pins[0].lon, pins[0].lat],
        zoom: pins.length === 1 ? 15 : 13,
      })

      const bounds = new lib.LngLatBounds()
      for (const pin of pins) {
        const marker = new lib.Marker()
          .setLngLat([pin.lon, pin.lat])
          .setPopup(new lib.Popup({ offset: 12 }).setText(pin.label))
          .addTo(map)
        if (onPinClick !== undefined) {
          const id = pin.id
          marker.getElement().addEventListener('click', () => onPinClick(id))
        }
        markers.push(marker)
        bounds.extend([pin.lon, pin.lat])
      }
      if (pins.length > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 16 })
    })

    return () => {
      cancelled = true
      for (const marker of markers) marker.remove()
      map?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pinsKey` to celowa sygnatura treści `pins`, patrz komentarz wyżej.
  }, [pinsKey, onPinClick])

  if (pins.length === 0) return null

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      className="h-64 w-full overflow-hidden rounded-2xl"
    />
  )
}
