import { describe, expect, it } from 'vitest'
import { route, waw0902 } from './queryTestHelpers'
import { buildSchedule } from './schedule'
import { courseVehicleAtStop, departuresWithVehicles, observedTripCourse, retainedDepartures } from './vehicleStatus'

async function schedule(loop = false, options: { dates?: [string, string, string]; times?: [string, string, string]; frequency?: boolean } = {}) {
  const dates = options.dates ?? ['2026-09-01', '2026-09-02', '2026-09-03']
  const times = options.times ?? ['09:00:00', '09:07:00', '09:17:00']
  return buildSchedule({
    feedVersion: null, serviceDates: dates, timezone: 'Europe/Warsaw', attribution: [], calendars: [],
    calendarDates: [{ serviceId: 'S', date: dates[1].replaceAll('-', ''), added: true }],
    frequencies: options.frequency ? [{ tripId: 'T', startSec: 9 * 3600, endSec: 10 * 3600, headwaySecs: 600 }] : [],
    routes: [route('509', 3)],
    stops: [
      { id: 'A', name: 'A', lat: 52.2, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      { id: 'B', name: 'B', lat: 52.22, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      { id: 'C', name: 'C', lat: 52.24, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
    ],
    trips: [{ routeId: '509', serviceId: 'S', tripId: 'T', headsign: 'C', directionId: 0 }],
    stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      `T,A,${times[0]},${times[0]},1`, `T,B,${times[1]},${times[1]},2`, `T,C,${times[2]},${times[2]},3`,
      ...(loop ? ['T,A,09:30:00,09:30:00,4'] : [])],
  })
}
const position = (timestamp = '2026-09-02T09:09:00+02:00') => ({ id: 'V/509/6', tripId: 'T', sideNumber: '1234', timestamp, lat: 52.21, lon: 21, bearing: 0 })

describe('inferred course status', () => {
  it('keeps frequency-service GPS locatable without inferring a dated status', async () => {
    const s = await schedule(false, { frequency: true })
    const rows = departuresWithVehicles(s, [position()], ['C'], waw0902(9, 9), 20)
    expect(rows[0].vehicle).toMatchObject({ id: 'V/509/6', tripId: 'T', pastScheduledDeparture: false })
  })
  it.each([
    { lat: 52.2199, lon: 21 }, // Near an ordinary shared stop vertex: ambiguous progress.
    { lat: 54, lon: 21 }, // GPS exists even when it cannot be projected onto the route.
    { lat: 52.23, lon: 21 }, // Already beyond B: location is independent of stop status.
  ])('keeps the map identity on future departures without reliable progress: $lat', async (point) => {
    const s = await schedule()
    const p = { ...position('2026-09-02T09:05:00+02:00'), ...point }
    const rows = departuresWithVehicles(s, [p], ['B'], waw0902(9, 5), 20)
    expect(rows[0].vehicle).toMatchObject({ id: p.id, tripId: 'T', sideNumber: '1234', serviceDate: '2026-09-02', pastScheduledDeparture: false })
  })
  it('joins the raw vehicle identity to its dated concrete course and selected stop', async () => {
    const s = await schedule()
    expect(courseVehicleAtStop(s, position(), waw0902(9, 9), { serviceDate: '2026-09-02', stopId: 'B', sequence: 2 })).toMatchObject({ id: 'V/509/6', tripId: 'T', sideNumber: '1234', serviceDate: '2026-09-02', stopsAway: 0, pastScheduledDeparture: true })
  })
  it('uses the GPS observation time, not the server clock, and requires more than sixty seconds', async () => {
    const s = await schedule()
    expect(courseVehicleAtStop(s, position('2026-09-02T09:08:00+02:00'), waw0902(9, 9), { stopId: 'B' })?.pastScheduledDeparture).toBe(false)
    expect(courseVehicleAtStop(s, position('2026-09-02T09:08:01+02:00'), waw0902(9, 9), { stopId: 'B' })?.pastScheduledDeparture).toBe(true)
  })
  it('does not assess stale or future GPS, wrong date, passed stops, or an unknown trip', async () => {
    const s = await schedule()
    expect(courseVehicleAtStop(s, position(), waw0902(9, 10) + 1, { stopId: 'B' })?.pastScheduledDeparture).toBe(false)
    expect(courseVehicleAtStop(s, position(), waw0902(9, 8), { stopId: 'B' })).toBeNull()
    expect(courseVehicleAtStop(s, position(), waw0902(9, 9), { serviceDate: '2026-09-03', stopId: 'B' })).toBeNull()
    expect(courseVehicleAtStop(s, position(), waw0902(9, 9), { stopId: 'A' })).toBeNull()
    expect(observedTripCourse(s, { ...position(), tripId: 'unknown' })).toBeNull()
  })
  it('does not assess a repeated-stop loop whose position is ambiguous', async () => {
    const s = await schedule(true)
    expect(courseVehicleAtStop(s, position(), waw0902(9, 9), { stopId: 'B' })?.pastScheduledDeparture ?? false).toBe(false)
  })
  it('retains an overdue arrival only while fresh GPS places that course before the selected stop', async () => {
    const s = await schedule()
    expect(retainedDepartures(s, [position()], ['B'], waw0902(9, 9))).toMatchObject([{ tripId: 'T', stopId: 'B', stopSequence: 2, serviceDate: '2026-09-02', vehicle: { pastScheduledDeparture: true } }])
    expect(retainedDepartures(s, [position()], ['B'], waw0902(9, 11))).toEqual([])
    expect(retainedDepartures(s, [{ ...position(), lat: 52.23 }], ['B'], waw0902(9, 9))).toEqual([])
  })
  it('accepts exactly sixty seconds of GPS age but not a millisecond more', async () => {
    const s = await schedule()
    expect(courseVehicleAtStop(s, position(), waw0902(9, 10), { stopId: 'B' })?.pastScheduledDeparture).toBe(true)
    expect(courseVehicleAtStop(s, position(), waw0902(9, 10) + 1, { stopId: 'B' })?.pastScheduledDeparture).toBe(false)
  })
  it('does not assess frequency service or a point away from its actual course', async () => {
    expect(observedTripCourse(await schedule(false, { frequency: true }), position())).toBeNull()
    expect(courseVehicleAtStop(await schedule(), { ...position(), lat: 54 }, waw0902(9, 9))).toBeNull()
  })
  it('preserves the previous service date for a course after midnight with GTFS times above 24h', async () => {
    const s = await schedule(false, { dates: ['2026-08-31', '2026-09-01', '2026-09-02'], times: ['25:00:00', '25:07:00', '25:17:00'] })
    const p = position('2026-09-02T01:09:00+02:00')
    expect(courseVehicleAtStop(s, p, Date.parse(p.timestamp), { stopId: 'B' })).toMatchObject({ serviceDate: '2026-09-01', pastScheduledDeparture: true })
  })
  it.each([
    { dates: ['2026-03-28', '2026-03-29', '2026-03-30'] as [string, string, string], timestamp: '2026-03-29T03:09:00+02:00' },
    { dates: ['2026-10-24', '2026-10-25', '2026-10-26'] as [string, string, string], timestamp: '2026-10-25T02:09:00+01:00' },
  ])('uses GTFS service-day time across the DST transition at $timestamp', async ({ dates, timestamp }) => {
    const s = await schedule(false, { dates, times: ['02:00:00', '02:07:00', '02:17:00'] })
    const p = position(timestamp)
    expect(courseVehicleAtStop(s, p, Date.parse(timestamp), { stopId: 'B' })).toMatchObject({ serviceDate: dates[1], pastScheduledDeparture: true })
  })
  it('merges retained and future visits in timetable order without duplicate vehicle rows', async () => {
    const s = await schedule()
    const rows = departuresWithVehicles(s, [position(), { ...position(), id: 'duplicate' }], ['B', 'C'], waw0902(9, 9), 20, true)
    expect(rows.map((d) => d.stopId)).toEqual(['B', 'C'])
    expect(rows[0].vehicle).toMatchObject({ id: 'V/509/6', pastScheduledDeparture: true })
    expect(rows[1].vehicle?.pastScheduledDeparture).toBe(false)
    expect(departuresWithVehicles(s, [], ['B'], waw0902(9, 9), 20)).toEqual([])
    expect(departuresWithVehicles(s, [position()], ['B'], waw0902(9, 9), 20)).toEqual([])
  })
})
