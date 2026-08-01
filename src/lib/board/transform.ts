import type { RawOperation } from '../pkp/types'

export type BoardRow = {
  trainNumber: string
  carrier: string
  category: string
  headsign: string
  plannedAt: string
  actualAt: string | null
  delayMinutes: number
  status: 'onTime' | 'delayed' | 'cancelled' | 'unknown'
  platform: string | null
}

export type BoardSnapshot = {
  stationId: string
  stationName: string
  departures: BoardRow[]
  arrivals: BoardRow[]
  fetchedAt: string
}

const VISIBLE_WINDOW_MS = 2 * 60 * 60 * 1000
const MAX_ROWS = 20

function computeDelayMinutes(plannedAt: string, actualAt: string | null, apiDelay: number | null): number {
  if (apiDelay !== null) return apiDelay
  if (actualAt === null) return 0
  const plannedMs = new Date(plannedAt).getTime()
  const actualMs = new Date(actualAt).getTime()
  return Math.round((actualMs - plannedMs) / 60000)
}

function computeStatus(cancelled: boolean, actualAt: string | null, delayMinutes: number): BoardRow['status'] {
  if (cancelled) return 'cancelled'
  if (actualAt === null) return 'unknown'
  if (delayMinutes >= 1) return 'delayed'
  return 'onTime'
}

function buildRow(
  trainNumber: string,
  carrier: string,
  category: string,
  headsign: string,
  plannedAt: string,
  actualAt: string | null,
  cancelled: boolean,
  apiDelay: number | null,
  platform: string | null
): BoardRow {
  const delayMinutes = computeDelayMinutes(plannedAt, actualAt, apiDelay)
  return {
    trainNumber,
    carrier,
    category,
    headsign,
    plannedAt,
    actualAt,
    delayMinutes,
    status: computeStatus(cancelled, actualAt, delayMinutes),
    platform,
  }
}

function withinWindow(plannedAt: string, now: Date): boolean {
  const plannedMs = new Date(plannedAt).getTime()
  const nowMs = now.getTime()
  return plannedMs >= nowMs - 60000 && plannedMs <= nowMs + VISIBLE_WINDOW_MS
}

function sortAndTrim(rows: BoardRow[], now: Date): BoardRow[] {
  return rows
    .filter((row) => withinWindow(row.plannedAt, now))
    .sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime())
    .slice(0, MAX_ROWS)
}

export function transformOperations(
  stationId: string,
  stationName: string,
  operations: RawOperation[],
  fetchedAt: string,
  now: Date = new Date(fetchedAt)
): BoardSnapshot {
  const departures: BoardRow[] = []
  const arrivals: BoardRow[] = []

  for (const op of operations) {
    const { stop } = op

    if (stop.plannedDeparture !== null) {
      departures.push(
        buildRow(
          op.trainNumber,
          op.carrier,
          op.category,
          op.destinationStationName,
          stop.plannedDeparture,
          stop.actualDeparture,
          stop.cancelled,
          stop.delayMinutes,
          stop.platform
        )
      )
    }

    if (stop.plannedArrival !== null) {
      arrivals.push(
        buildRow(
          op.trainNumber,
          op.carrier,
          op.category,
          op.originStationName,
          stop.plannedArrival,
          stop.actualArrival,
          stop.cancelled,
          stop.delayMinutes,
          stop.platform
        )
      )
    }
  }

  return {
    stationId,
    stationName,
    departures: sortAndTrim(departures, now),
    arrivals: sortAndTrim(arrivals, now),
    fetchedAt,
  }
}
