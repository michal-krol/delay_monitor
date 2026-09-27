import type { RealizationStatus } from './realization'
import type { BoardSnapshot } from './transform'

/** Najbliższy odjazd w karcie stacji na mapie — wyłącznie to, co snapshot pollera już ma. */
export type RailStationDeparture = {
  plannedAt: string
  headsign: string | null
  delayMinutes: number | null
  status: RealizationStatus
  trainLabel: string
  carrier: string
  platform: string | null
  track: string | null
}

export type RailStationStatus = {
  id: string
  /** Status najbliższego odjazdu; `unknown` gdy snapshot nie ma przyszłych odjazdów. */
  status: RealizationStatus
  nextDepartures: RailStationDeparture[]
  ageMs: number
}

const PREVIEW_LIMIT = 3

/** Snapshot stacji → status do mapy. Czysta; `now` z zewnątrz (testy). */
export function railStationStatus(snapshot: BoardSnapshot, now: number): RailStationStatus {
  const upcoming = snapshot.departures.filter((row) => Date.parse(row.plannedAt) >= now).slice(0, PREVIEW_LIMIT)
  return {
    id: snapshot.stationId,
    status: upcoming[0]?.status ?? 'unknown',
    nextDepartures: upcoming.map((row) => ({
      plannedAt: row.plannedAt,
      headsign: row.headsign,
      delayMinutes: row.delayMinutes,
      status: row.status,
      trainLabel: row.trainLabel,
      carrier: row.carrier,
      platform: row.platform,
      track: row.track,
    })),
    ageMs: now - Date.parse(snapshot.fetchedAt),
  }
}
