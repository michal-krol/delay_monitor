/** Informacyjny wniosek z rozkładu i GPS, nigdy realizacja ani prognoza z feedu. */
import { courseDetail, type CourseDetail } from './courses'
import { nextDepartures, resolveStopIndices } from './departures'
import { projectCoursePosition } from './vehicleProject'
import type { GtfsDeparture, GtfsSchedule } from './types'
import type { VehiclePosition } from './vehicles'

export const STATUS_GPS_MAX_AGE_SEC = 60
const STATUS_GRACE_MS = 60_000
const COURSE_WINDOW_MARGIN_MS = 3600_000
// Derived data belongs to one immutable poll snapshot; weak keys release it with that snapshot.
const courseCache = new WeakMap<GtfsSchedule, WeakMap<VehiclePosition, CourseDetail | null>>()
const projectionCache = new WeakMap<CourseDetail, WeakMap<VehiclePosition, ReturnType<typeof projectCoursePosition>>>()

export type VehicleStatusContext = { serviceDate?: string; stopId?: string; sequence?: number }
export type VehicleStopStatus = {
  id: string
  tripId: string
  sideNumber: string
  observedAt: string
  serviceDate?: string
  stopsAway: number | null
  ageSec: number
  pastScheduledDeparture: boolean
}

/** Resolve a unique active dated trip around the observation, including GTFS times >24h. */
export function observedTripCourse(schedule: GtfsSchedule, position: VehiclePosition, serviceDate?: string): CourseDetail | null {
  let byPosition = courseCache.get(schedule)
  if (byPosition === undefined) { byPosition = new WeakMap(); courseCache.set(schedule, byPosition) }
  const cached = byPosition.get(position)
  if (cached !== undefined) return cached !== null && (serviceDate === undefined || cached.serviceDate === serviceDate) ? cached : null
  const template = schedule.courseTemplates.get(position.tripId)
  const observed = Date.parse(position.timestamp)
  if (template === undefined || !Number.isFinite(observed)) return null
  const routeId = schedule.routes[template.routeIdx]?.id
  if (routeId === undefined) return null
  const matches = schedule.serviceDates.flatMap((date) => {
    const course = courseDetail(schedule, routeId, position.tripId, date, false)
    const first = course?.stops[0]
    const last = course?.stops.at(-1)
    if (course === null || first === undefined || last === undefined) return []
    return observed >= Date.parse(first.plannedAt) - COURSE_WINDOW_MARGIN_MS && observed <= Date.parse(last.plannedAt) + COURSE_WINDOW_MARGIN_MS ? [course] : []
  })
  const result = matches.length === 1 ? matches[0] : null
  byPosition.set(position, result)
  return result !== null && (serviceDate === undefined || result.serviceDate === serviceDate) ? result : null
}

/** Selected stop occurrence, or the next stop of the actual course when no selection is supplied. */
export function courseVehicleAtStop(schedule: GtfsSchedule, position: VehiclePosition, nowMs: number, context: VehicleStatusContext = {}): VehicleStopStatus | null {
  const observed = Date.parse(position.timestamp)
  if (!Number.isFinite(observed) || observed > nowMs) return null
  const course = observedTripCourse(schedule, position, context.serviceDate)
  if (course === null) return null
  let byPosition = projectionCache.get(course)
  if (byPosition === undefined) { byPosition = new WeakMap(); projectionCache.set(course, byPosition) }
  let projection = byPosition.get(position)
  if (projection === undefined) { projection = projectCoursePosition(position, course.stops, true); byPosition.set(position, projection) }
  if (projection === null) return null
  const target = context.sequence !== undefined
    ? course.stops.findIndex((s) => s.sequence === context.sequence && (context.stopId === undefined || s.stopId === context.stopId))
    : context.stopId !== undefined
      ? course.stops.findIndex((s) => s.stopId === context.stopId)
      : projection.afterStopOrder + 1
  const stop = course.stops[target]
  if (stop === undefined || target <= projection.afterStopOrder || (target === projection.afterStopOrder + 1 && projection.fraction >= 1)) return null
  const ageMs = nowMs - observed
  // Repeated stops may put the same physical GPS point on different occurrences. Keep map identity,
  // but do not infer a status even if the nearest-segment tie happened to pick one occurrence.
  const unambiguous = new Set(course.stops.map((s) => s.stopId)).size === course.stops.length
  return {
    id: position.id, tripId: position.tripId, sideNumber: position.sideNumber,
    observedAt: position.timestamp, serviceDate: course.serviceDate,
    stopsAway: target - projection.afterStopOrder - 1, ageSec: Math.floor(ageMs / 1000),
    pastScheduledDeparture: unambiguous && ageMs <= STATUS_GPS_MAX_AGE_SEC * 1000 && observed > Date.parse(stop.plannedAt) + STATUS_GRACE_MS,
  }
}

/** Only visits of currently observed vehicles are considered; no scan over historical stop events. */
export function retainedDepartures(schedule: GtfsSchedule, positions: VehiclePosition[], ids: string[], nowMs: number): (GtfsDeparture & { vehicle: VehicleStopStatus })[] {
  const selected = new Set(ids.flatMap((id) => resolveStopIndices(schedule, id)))
  const result: (GtfsDeparture & { vehicle: VehicleStopStatus })[] = []
  for (const position of positions) {
    const age = nowMs - Date.parse(position.timestamp)
    if (age < 0 || age > STATUS_GPS_MAX_AGE_SEC * 1000) continue
    const course = observedTripCourse(schedule, position)
    const template = schedule.courseTemplates.get(position.tripId)
    if (course === null || template === undefined) continue
    const route = schedule.routes[template.routeIdx]
    for (const [order, stop] of course.stops.entries()) {
      const stopIdx = template.pattern.stops[order]
      if (!selected.has(stopIdx) || Date.parse(stop.plannedAt) >= nowMs) continue
      const vehicle = courseVehicleAtStop(schedule, position, nowMs, { serviceDate: course.serviceDate, stopId: stop.stopId, sequence: stop.sequence })
      if (!vehicle?.pastScheduledDeparture) continue
      result.push({
        retainedForVehicle: true,
        tripId: course.tripId, serviceDate: course.serviceDate, routeId: route.id, line: route.shortName || route.longName || route.id,
        mode: route.mode, lineKind: route.kind, headsign: course.headsign, directionId: course.directionId,
        stopId: stop.stopId, stopSequence: stop.sequence,
        stopOccurrence: course.stops.slice(0, order).filter((s) => s.stopId === stop.stopId).length,
        plannedAt: stop.plannedAt, departureSec: stop.departureSec, stopCode: stop.code,
        platformCode: schedule.stopPlatforms[stopIdx], wheelchair: stop.wheelchair,
        frequencyBased: false, onRequest: stop.onRequest, vehicle,
      })
    }
  }
  return result
}

/** Shared board overlay, also for a whole stop group: use the row's concrete stop, never a representative route. */
export function departuresWithVehicles(schedule: GtfsSchedule, positions: VehiclePosition[], ids: string[], nowMs: number, limit: number, retainOverdue = false): (GtfsDeparture & { vehicle: VehicleStopStatus | null })[] {
  const firstByTrip = new Map<string, VehiclePosition>()
  for (const position of positions) if (!firstByTrip.has(position.tripId)) firstByTrip.set(position.tripId, position)
  const future = nextDepartures(schedule, ids, nowMs, limit).map((d) => {
    const position = firstByTrip.get(d.tripId)
    const course = position === undefined ? null : observedTripCourse(schedule, position)
    const ageMs = position === undefined ? NaN : nowMs - Date.parse(position.timestamp)
    // A map link needs feed identity, not a successful geometric progress estimate.
    const identity = position !== undefined && (course === null || course.serviceDate === d.serviceDate) && ageMs >= 0 ? {
      id: position.id, tripId: position.tripId, sideNumber: position.sideNumber,
      observedAt: position.timestamp, serviceDate: course?.serviceDate,
      ageSec: Math.floor(ageMs / 1000), stopsAway: null, pastScheduledDeparture: false,
    } : null
    const status = position === undefined ? null : courseVehicleAtStop(schedule, position, nowMs, { serviceDate: d.serviceDate, stopId: d.stopId, sequence: d.stopSequence })
    return { ...d, vehicle: status ?? identity }
  })
  const rows = new Map<string, GtfsDeparture & { vehicle: VehicleStopStatus | null }>()
  const retained = retainOverdue ? retainedDepartures(schedule, [...firstByTrip.values()], ids, nowMs) : []
  for (const d of [...future, ...retained]) rows.set(`${d.tripId}/${d.serviceDate}/${d.stopId}/${d.stopSequence}`, d)
  return [...rows.values()].sort((a, b) => Date.parse(a.plannedAt) - Date.parse(b.plannedAt)).slice(0, limit)
}
