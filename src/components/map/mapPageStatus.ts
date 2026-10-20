import type { CityStop } from '@/lib/gtfs/query'
import type { MapRailStation } from '@/lib/weather/coordinates'
import { formatAgo } from '@/lib/format'
import { pinnedKey, type PinnedItem } from '@/hooks/usePinned'
import type { MapSelection } from './MapCard'
import type { PinnedPoint } from './MapPanels'

/** Tekst statusu pozycji pojazdów w nagłówku mapy: wczytywanie / błąd / nieaktualne (z godziną w strefie miasta) / wiek odczytu przeglądarki. */
export function vehicleFreshness(
  v: { vehicleCount: number; failed: boolean; lastSuccessAt: number | null; now: number },
  timeZone: string
): string {
  const neverLoaded = v.vehicleCount === 0
  if (neverLoaded && !v.failed) return 'wczytywanie pozycji pojazdów…'
  if (neverLoaded) return 'nie udało się pobrać pozycji pojazdów'
  if (v.failed) {
    // Wiek ostatnich dobrych danych (ui-copy.md „Data age", #7): godzina w strefie miasta.
    const at = v.lastSuccessAt !== null ? ` · dane z ${new Date(v.lastSuccessAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone })}` : ''
    return `pozycje pojazdów nieaktualne — pokazujemy ostatnie dostępne${at}`
  }
  // Kiedy PRZEGLĄDARKA pobrała odczyt (rośnie z zegarem) — wiek GPS pojazdów jest osobno („Pozycje sprzed", ui-copy.md).
  return v.lastSuccessAt !== null ? `pobrano ${formatAgo(Math.round((v.now - v.lastSuccessAt) / 1000))}` : 'pozycje pojazdów na żywo'
}

/** Przypięte (Pulpit) z pozycją na mapie: stacje z listy kolei, przystanki tego miasta z listy przystanków. */
export function pinnedMapPoints(pinned: PinnedItem[], city: string, stations: MapRailStation[] | null, stops: CityStop[] | null): PinnedPoint[] {
  const points: PinnedPoint[] = []
  for (const fav of pinned) {
    const hit =
      fav.kind === 'pkp'
        ? stations?.find((s) => s.id === fav.id)
        : fav.city === city
          ? stops?.find((s) => s.id === fav.id || s.groupId === fav.id)
          : undefined
    if (hit !== undefined) points.push({ key: pinnedKey(fav), name: fav.name, lat: hit.lat, lon: hit.lon })
  }
  return points
}

/** Zaznaczenie przystanku z listy przystanków miasta (jedno miejsce zamiast kilku kopii literału). */
export function stopSelection(stop: CityStop): Extract<MapSelection, { kind: 'stop' }> {
  return { kind: 'stop', id: stop.id, groupId: stop.groupId, name: stop.name, code: stop.code, mode: stop.mode, lat: stop.lat, lon: stop.lon }
}
