import type { RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'
import { combineWarsawDateAndTime } from '../pkp/time'
import { formatPlatform } from './transform'

export type TrainDetailStop = {
  stationId: string
  stationName: string
  plannedArrival: string | null
  actualArrival: string | null
  arrivalDelayMinutes: number | null
  plannedDeparture: string | null
  actualDeparture: string | null
  departureDelayMinutes: number | null
  isCancelled: boolean
  isConfirmed: boolean
  platform: string | null
}

function findRouteStop(route: RawRoute | null, stationId: string): RawRouteStop | undefined {
  return route?.stations.find((stop) => stop.stationId === stationId)
}

/**
 * `/operations/train/{scheduleId}/{orderId}/{operatingDate}` — jedyne źródło
 * czasu FAKTYCZNEGO per przystanek — nie niesie ani planowego czasu, ani
 * opóźnienia (stwierdzone na żywym API, nie w dokumentacji: żaden przystanek
 * w realnej odpowiedzi nie miał `plannedArrival`/`arrivalDelayMinutes`).
 * Opóźnienie trzeba więc policzyć samemu z planu w `/schedules/route/...`
 * (`arrivalTime`/`departureTime`, HH:mm:ss) + `operatingDate`.
 *
 * Wyjątek: fixture'y mocka (i teoretycznie przyszłe warianty API) MOGĄ podać
 * `plannedArrival`/`arrivalDelayMinutes` wprost na obiekcie operacji — to ma
 * pierwszeństwo, liczenie z trasy jest tylko rezerwowe.
 */
function resolvePlannedTime(
  apiPlanned: string | null,
  operatingDate: string | null,
  time: string | null | undefined,
  dayOffset: number | null | undefined
): string | null {
  if (apiPlanned !== null) return apiPlanned
  if (operatingDate === null) return null
  return combineWarsawDateAndTime(operatingDate, time ?? null, dayOffset ?? null)
}

function resolveDelayMinutes(apiDelay: number | null, planned: string | null, actual: string | null): number | null {
  if (apiDelay !== null) return apiDelay
  if (planned === null || actual === null) return null
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60000)
}

/**
 * Łączy realizację (`operation`, czasy faktyczne) z trasą rozkładową (`route`,
 * czasy planowe + peron/tor) w pełną, przystanek-po-przystanku listę do panelu
 * szczegółów połączenia. `route` bywa `null` — pociąg bez dopasowanej trasy
 * (patrz „Znane ograniczenia" w README) wciąż pokazuje realizację, tylko bez
 * planu/opóźnienia/peronu.
 *
 * Czysta funkcja — bez sieci, testowalna wprost (wzorem `transformOperations`).
 */
export function buildTrainDetailStops(
  operation: RawTrainOperation,
  route: RawRoute | null,
  stationNames: Record<string, string>
): TrainDetailStop[] {
  return operation.stations.map((stop) => {
    const routeStop = findRouteStop(route, stop.stationId)

    const plannedArrival = resolvePlannedTime(stop.plannedArrival, operation.operatingDate, routeStop?.arrivalTime, routeStop?.arrivalDay)
    const plannedDeparture = resolvePlannedTime(stop.plannedDeparture, operation.operatingDate, routeStop?.departureTime, routeStop?.departureDay)

    return {
      stationId: stop.stationId,
      stationName: stationNames[stop.stationId] ?? stop.stationId,
      plannedArrival,
      actualArrival: stop.actualArrival,
      arrivalDelayMinutes: resolveDelayMinutes(stop.arrivalDelayMinutes, plannedArrival, stop.actualArrival),
      plannedDeparture,
      actualDeparture: stop.actualDeparture,
      departureDelayMinutes: resolveDelayMinutes(stop.departureDelayMinutes, plannedDeparture, stop.actualDeparture),
      isCancelled: stop.isCancelled,
      isConfirmed: stop.isConfirmed,
      // Odjazdowy peron/tor pierwszy — to ten, przy którym pasażer czeka, żeby
      // jechać dalej; brakujący dobija peron/tor przyjazdu (np. stacja końcowa).
      platform: formatPlatform(
        routeStop?.departurePlatform ?? routeStop?.arrivalPlatform,
        routeStop?.departureTrack ?? routeStop?.arrivalTrack
      ),
    }
  })
}
