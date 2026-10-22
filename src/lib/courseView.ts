import { decodeStopIdFromPathSegment, GTFS_ROUTE_ID_PATTERN, GTFS_SEQUENCE_PATTERN, GTFS_STOP_ID_PATTERN, GTFS_TRIP_ID_PATTERN, isGtfsServiceDate } from './validation'
import { warsawDateString } from './pkp/time'

export type CourseView = { tripId: string; serviceDate: string; sequence: number | null; stopId: string | null }

export function parseCourseView(params: { get(name: string): string | null }): CourseView | null {
  const tripId = params.get('trip') ?? ''
  const serviceDate = params.get('date') ?? ''
  const seq = params.get('seq')
  if (!GTFS_TRIP_ID_PATTERN.test(tripId) || !isGtfsServiceDate(serviceDate) || (seq !== null && (!GTFS_SEQUENCE_PATTERN.test(seq) || Number(seq) > 65535))) return null
  const stop = params.get('stop')
  return { tripId, serviceDate, sequence: seq === null ? null : Number(seq), stopId: stop !== null && GTFS_STOP_ID_PATTERN.test(stop) ? stop : null }
}

export function courseHref(city: string, routeId: string, departure: { tripId: string; serviceDate: string; stopId?: string | null; stopSequence?: number | null }, returnTo?: string): string {
  const params = new URLSearchParams({ trip: departure.tripId, date: departure.serviceDate })
  if (departure.stopId != null) params.set('stop', departure.stopId)
  if (departure.stopSequence != null) params.set('seq', String(departure.stopSequence))
  if (returnTo !== undefined && safeStopReturnHref(returnTo, city) !== null) params.set('from', returnTo)
  return `/city/${city}/line/${encodeURIComponent(routeId)}?${params}`
}

export function timetableHref(city: string, routeId: string, stopId: string, directionId?: number, occurrence = 0): string {
  const params = new URLSearchParams({ stop: stopId, pane: 'timetable' })
  if (directionId !== undefined) params.set('dir', String(directionId))
  if (occurrence > 0) params.set('occ', String(occurrence))
  return `/city/${city}/line/${encodeURIComponent(routeId)}?${params}`
}

/** Only our own board route and allowlisted view keys can become a return link. */
export function safeStopReturnHref(value: string | null, city: string): string | null {
  if (value === null || value.length > 1000) return null
  try {
    const url = new URL(value, 'https://return.invalid')
    const segments = url.pathname.split('/')
    if (url.origin !== 'https://return.invalid' || segments[1] !== 'city' || segments[2] !== city) return null
    const embeddedStop = url.searchParams.get('stop')
    const boardPath = segments.length === 5 && segments[3] === 'stop' && GTFS_STOP_ID_PATTERN.test(decodeStopIdFromPathSegment(segments[4]))
    const embeddedPath = segments.length === 3 && embeddedStop !== null && GTFS_STOP_ID_PATTERN.test(embeddedStop)
    if (!boardPath && !embeddedPath) return null
    const params = new URLSearchParams()
    if (embeddedPath) params.set('stop', embeddedStop!)
    const member = url.searchParams.get('przystanek')
    const line = url.searchParams.get('line')
    const tab = url.searchParams.get('tab')
    if (member !== null && GTFS_STOP_ID_PATTERN.test(member)) params.set('przystanek', member)
    if (line !== null && GTFS_ROUTE_ID_PATTERN.test(line)) params.set('line', line)
    if (tab !== null && ['departures', 'schedule', 'alerts'].includes(tab)) params.set('tab', tab)
    return `${url.pathname}${params.size === 0 ? '' : `?${params}`}`
  } catch { return null }
}

/** plannedAt already carries the city's civil date; the service date can be the previous day. */
export function departureDateLabel(plannedAt: string, now: number): string | null {
  const date = plannedAt.slice(0, 10)
  return date === warsawDateString(new Date(now)) ? null : `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
}
