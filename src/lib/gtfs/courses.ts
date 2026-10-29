/** Concrete trips use their own interned stop/time variant, never the representative route. */
import { isoInZone, serviceDayNoonEpoch } from '@/lib/pkp/time'
import { activeServices } from './schedule'
import { SERVICE_CATEGORIES, shapeToPoints, type LineRouteStop } from './lines'
import type { CoursePattern, GtfsSchedule } from './types'
import type { ServiceCategory } from './schema'

export type CourseStop = LineRouteStop & { sequence: number; departureSec: number; plannedAt: string }
export type CourseDetail = { tripId: string; serviceDate: string; directionId: number; headsign: string | null; departureSec: number; stops: CourseStop[]; shape: [number, number][] | null }
export type StopTimetableEntry = { tripId: string; serviceDate: string; sequence: number; occurrence: number; departureSec: number; category: ServiceCategory }
export type TimetableStop = { stopId: string; groupId: string; name: string; code: string | null; headsigns?: string[] }

/** Small per-line metadata derived from the existing route→trip index, never from stop_times events. */
export function courseStopCounts(schedule: GtfsSchedule, routeId: string): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}
  const routeIdx = schedule.routeIndexById.get(routeId)
  if (routeIdx === undefined) return result
  for (const direction of [0, 1, 2]) {
    const counts = new Map<string, number>()
    const seen = new Set<CoursePattern>()
    for (const tripId of schedule.courseTripsByRoute.get(routeIdx) ?? []) {
      const template = schedule.courseTemplates.get(tripId)!
      if (template.directionId !== direction || seen.has(template.pattern)) continue
      seen.add(template.pattern)
      const patternCounts = new Map<string, number>()
      for (const idx of template.pattern.stops) {
        const stopId = schedule.stopIds[idx]
        const count = (patternCounts.get(stopId) ?? 0) + 1
        patternCounts.set(stopId, count)
        counts.set(stopId, Math.max(count, counts.get(stopId) ?? 0))
      }
    }
    result[String(direction)] = Object.fromEntries(counts)
  }
  return result
}

export function timetableStop(schedule: GtfsSchedule, routeId: string, directionId: number, stopId: string): TimetableStop | null {
  const routeIdx = schedule.routeIndexById.get(routeId)
  const stopIdx = schedule.stopIndexById.get(stopId)
  if (routeIdx === undefined || stopIdx === undefined) return null
  const matching = (schedule.courseTripsByRoute.get(routeIdx) ?? []).filter((trip) => {
    const template = schedule.courseTemplates.get(trip)!
    return template.directionId === directionId && template.pattern.stops.includes(stopIdx)
  })
  if (matching.length === 0) return null
  const groupId = schedule.stopGroupIds[stopIdx]
  const headsigns = [...new Set(matching.flatMap((trip) => { const idx = schedule.courseTemplates.get(trip)!.headsignIdx; return idx < 0 ? [] : [schedule.headsigns[idx]] }))]
  return { stopId, groupId, name: schedule.groupName.get(groupId) ?? schedule.stopNames[stopIdx], code: schedule.stopCodes[stopIdx] ?? schedule.stopPlatforms[stopIdx] ?? null, headsigns }
}

export function courseDetail(schedule: GtfsSchedule, routeId: string, tripId: string, date: string, includeShape = true): CourseDetail | null {
  const template = schedule.courseTemplates.get(tripId)
  if (template === undefined || template.routeIdx !== schedule.routeIndexById.get(routeId)) return null
  if (!activeServices(date, schedule.courseCalendars, schedule.courseCalendarDates).has(template.serviceId)) return null
  const epoch = serviceDayNoonEpoch(date, schedule.timezone) - 12 * 3600_000
  const stops = template.pattern.stops.map((idx, order) => {
    const groupId = schedule.stopGroupIds[idx]
    const departureSec = template.departureSec + template.pattern.offsets[order]
    return { stopId: schedule.stopIds[idx], groupId, name: schedule.groupName.get(groupId) ?? schedule.stopNames[idx], code: schedule.stopCodes[idx] ?? schedule.stopPlatforms[idx] ?? null, street: schedule.stopStreets[idx] ?? null, wheelchair: schedule.stopWheelchair[idx] as 0 | 1 | 2, lat: schedule.stopLat[idx], lon: schedule.stopLon[idx], offsetSec: template.pattern.offsets[order], onRequest: template.pattern.onRequest[order] === 1, sequence: template.pattern.sequences[order], departureSec, plannedAt: isoInZone(epoch + departureSec * 1000, schedule.timezone) }
  })
  const shape = !includeShape || template.pattern.shapeId === null ? undefined : schedule.courseShapes.get(template.pattern.shapeId)
  return { tripId, serviceDate: date, directionId: template.directionId, headsign: template.headsignIdx < 0 ? null : schedule.headsigns[template.headsignIdx], departureSec: template.departureSec, stops, shape: shape === undefined ? null : shapeToPoints(shape) }
}

const addServiceDays = (date: string, days: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10)

/** Earliest available date at/after today's board date, applying service exceptions. */
function firstServiceDate(schedule: GtfsSchedule, serviceId: string): string | null {
  const from = schedule.serviceDates[1].replaceAll('-', '')
  const candidates = schedule.courseCalendarDates.filter((d) => d.serviceId === serviceId && d.added && d.date >= from).map((d) => d.date)
  for (const calendar of schedule.courseCalendars) {
    if (calendar.serviceId !== serviceId) continue
    const start = calendar.startDate > from ? calendar.startDate : from
    // A calendar's first occurrence is within seven days; exceptions may remove a week, so bound by endDate.
    let date = `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`
    for (let i = 0; i < 370 && date.replaceAll('-', '') <= calendar.endDate; i += 1) {
      if (activeServices(date, [calendar], schedule.courseCalendarDates).has(serviceId)) { candidates.push(date.replaceAll('-', '')); break }
      date = addServiceDays(date, 1)
    }
  }
  const candidate = candidates.sort()[0]
  return candidate === undefined ? null : `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-${candidate.slice(6, 8)}`
}

export function stopTimetable(schedule: GtfsSchedule, routeId: string, directionId: number, stopId: string): StopTimetableEntry[] {
  const routeIdx = schedule.routeIndexById.get(routeId)
  if (routeIdx === undefined) return []
  const stopIdx = schedule.stopIndexById.get(stopId)
  if (stopIdx === undefined) return []
  const dates = new Map<string, string | null>()
  const trips = (schedule.courseTripsByRoute.get(routeIdx) ?? []).filter((tripId) => {
    const template = schedule.courseTemplates.get(tripId)!
    return template.directionId === directionId && template.pattern.stops.includes(stopIdx)
  })
  for (const tripId of trips) {
    const { serviceId } = schedule.courseTemplates.get(tripId)!
    if (!dates.has(serviceId)) dates.set(serviceId, firstServiceDate(schedule, serviceId))
  }
  const earliest = [...dates.values()].filter((date): date is string => date !== null).sort()[0]
  if (earliest === undefined) return []
  // One shared seven-day planning horizon, not an inferred feed publication version.
  const today = schedule.serviceDates[1]
  const anchor = earliest <= addServiceDays(today, 6) ? today : earliest
  const end = addServiceDays(anchor, 6)
  const categoryDates = new Map<number, string>()
  for (const tripId of trips) {
    const template = schedule.courseTemplates.get(tripId)!
    const date = dates.get(template.serviceId)
    const previous = categoryDates.get(template.category)
    if (date != null && date <= end && (previous === undefined || date < previous)) categoryDates.set(template.category, date)
  }
  const activeByDate = new Map([...new Set(categoryDates.values())].map((date) => [date, activeServices(date, schedule.courseCalendars, schedule.courseCalendarDates)]))
  const rows: StopTimetableEntry[] = []
  for (const tripId of trips) {
    const template = schedule.courseTemplates.get(tripId)!
    const serviceDate = categoryDates.get(template.category)
    if (serviceDate === undefined || !activeByDate.get(serviceDate)!.has(template.serviceId)) continue
    let occurrence = 0
    template.pattern.stops.forEach((idx, order) => {
      if (idx === stopIdx) rows.push({ tripId, serviceDate, sequence: template.pattern.sequences[order], occurrence: occurrence++, departureSec: template.departureSec + template.pattern.offsets[order], category: SERVICE_CATEGORIES[template.category] ?? 'other' })
    })
  }
  // A shared minute is insufficient: only equal complete daily profiles can share
  // the weekday presentation. Keep multiplicity and all actual concurrent trips.
  const weekdays = rows.filter((row) => row.category === 'weekday')
  const fridays = rows.filter((row) => row.category === 'friday')
  const patterns = new Map<CoursePattern, number>()
  const profile = (entries: StopTimetableEntry[]) => entries.map((row) => {
    const template = schedule.courseTemplates.get(row.tripId)!
    if (!patterns.has(template.pattern)) patterns.set(template.pattern, patterns.size)
    return `${patterns.get(template.pattern)}:${template.headsignIdx}:${row.departureSec}:${row.sequence}:${row.occurrence}`
  }).sort().join('|')
  const sameWeekdayProfile = weekdays.length > 0 && fridays.length > 0 && weekdays[0].serviceDate !== fridays[0].serviceDate && profile(weekdays) === profile(fridays)
  const redundantCategory = sameWeekdayProfile && fridays[0].serviceDate < weekdays[0].serviceDate ? 'weekday' : 'friday'
  return rows
    .filter((row) => !sameWeekdayProfile || row.category !== redundantCategory)
    .map((row) => sameWeekdayProfile && row.category === 'friday' ? { ...row, category: 'weekday' as const } : row)
    .sort((a, b) => a.departureSec - b.departureSec || a.tripId.localeCompare(b.tripId))
}
