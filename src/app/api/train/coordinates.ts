import { getStationCoordinates } from '@/lib/weather/coordinates'
import type { TrainDetailStop } from '@/lib/board/trainDetail'
import type { TrainDetailStopWithCoords } from '@/lib/board/mapPosition'

/**
 * Dekoruje przystanki o statyczne współrzędne stacji (mapa trasy na
 * `/connection`) -- czysty odczyt lokalnego pliku przez `getStationCoordinates`,
 * zero sieci w runtime (AGENTS.md #6). Żyje na granicy `/api/train`, nie w
 * `lib/board`, żeby `trainDetail.ts` zostało wolne od tej zależności.
 */
export async function attachStopCoordinates(stops: TrainDetailStop[]): Promise<TrainDetailStopWithCoords[]> {
  return Promise.all(
    stops.map(async (stop) => {
      // Wzbogacenie, nie rdzeń odpowiedzi -- ten sam duch co getNameDictionaries()/
      // getDisruptions() w route.ts: `getStationCoordinates` celowo rzuca, gdy plik
      // danych jest uszkodzony/brakujący (AGENTS.md #7), ale to nie powód, żeby cały
      // /api/train oddał 500 (i kazał ponownie, płatnie pytać PKP przy odświeżeniu).
      const coords = await getStationCoordinates(stop.stationId).catch(() => null)
      return { ...stop, lat: coords?.lat ?? null, lon: coords?.lon ?? null }
    })
  )
}
