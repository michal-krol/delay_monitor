import { describe, expect, it } from 'vitest'
import { buildSchedule, type BuildScheduleInput } from './schedule'
import { courseDetail, courseStopCounts, stopTimetable } from './courses'
import { createMockClient } from './mock'
import { loadSchedule } from './loader'
import { getCity } from './cities'

const input: BuildScheduleInput = {
  feedVersion: 'test', serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'], timezone: 'Europe/Warsaw', attribution: [],
  routes: [{ id: '20', shortName: '20', longName: 'A–B', mode: 'tram', kind: 'regular' }],
  stops: ['100101', '200101'].map((id, i) => ({ id, name: i ? 'B' : 'A', code: '01', lat: 52 + i / 100, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 })),
  trips: [{ tripId: 'loop', routeId: '20', serviceId: 'S', headsign: 'B', directionId: 0 }, { tripId: 'short', routeId: '20', serviceId: 'SAT', headsign: 'B', directionId: 0 }],
  calendars: [], calendarDates: [{ serviceId: 'S', date: '20260902', added: true }, { serviceId: 'SAT', date: '20260905', added: true }], frequencies: [],
  stopTimeLines: ['trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type', 'loop,24:05:00,24:05:00,100101,1,0,0', 'loop,24:10:00,24:10:00,200101,2,3,3', 'loop,24:15:00,24:15:00,100101,3,0,0', 'short,12:00:00,12:00:00,100101,1,0,0', 'short,12:10:00,12:10:00,200101,2,0,0'],
}

describe('concrete GTFS course', () => {
  it('shares retained patterns in the complete mock feed and reports their numeric storage floor', async () => {
    const city = getCity('warszawa')!
    const schedule = await loadSchedule(createMockClient(city), city)
    const patterns = new Set([...schedule.courseTemplates.values()].map((t) => t.pattern))
    const numericBytes = [...patterns].reduce((sum, p) => sum + (p.stops.length + p.offsets.length + p.sequences.length + p.onRequest.length) * 8, 0)
    const shapes = [...schedule.courseShapes.values()]
    const shapeBytes = shapes.reduce((sum, s) => sum + s.byteLength, 0)
    expect(patterns.size).toBeLessThan(schedule.courseTemplates.size)
    console.info('PR06 mock-only storage floor (excludes objects, strings, Maps; not live-scale):', JSON.stringify({ templates: schedule.courseTemplates.size, patterns: patterns.size, shapePoints: shapeBytes / 8, numericBytes, shapeBytes }))
  })
  it('keeps actual loop occurrences, NŻ and service date beyond midnight', async () => {
    const schedule = await buildSchedule(input)
    const course = courseDetail(schedule, '20', 'loop', '2026-09-02')!
    expect(course.stops.map((s) => s.stopId)).toEqual(['100101', '200101', '100101'])
    expect(course.stops.map((s) => s.sequence)).toEqual([1, 2, 3])
    expect(course.stops[1].onRequest).toBe(true)
    expect(course.stops[0].plannedAt).toBe('2026-09-03T00:05:00+02:00')
    expect(course.shape).toBeNull()
    expect(course.serviceDate).toBe('2026-09-02')
  })
  it('resolves the actual shorter Saturday trip outside the active board window', async () => {
    const schedule = await buildSchedule(input)
    expect(courseDetail(schedule, '20', 'short', '2026-09-05')?.stops).toHaveLength(2)
    expect(courseDetail(schedule, '20', 'loop', '2026-09-05')).toBeNull()
    expect(courseDetail(schedule, '20', 'missing', '2026-09-02')).toBeNull()
    expect(courseDetail(schedule, 'wrong', 'loop', '2026-09-02')).toBeNull()
  })
  it('lists each repeated occurrence and retains concrete trip identity in the timetable', async () => {
    const schedule = await buildSchedule(input)
    const rows = stopTimetable(schedule, '20', 0, '100101')
    expect(rows.map((r) => [r.tripId, r.sequence, r.departureSec])).toEqual([['short', 1, 43200], ['loop', 1, 86700], ['loop', 3, 87300]])
    expect(rows.find((r) => r.tripId === 'short')?.serviceDate).toBe('2026-09-05')
    expect(rows.filter((r) => r.tripId === 'loop').map((r) => r.occurrence)).toEqual([0, 1])
    expect(courseStopCounts(schedule, '20')['0']['100101']).toBe(2)
  })
  it('keeps shape geometry attached to the actual variant rather than the representative direction', async () => {
    const schedule = await buildSchedule({ ...input, trips: input.trips.map((t) => ({ ...t, shapeId: t.tripId })), shapeLines: async () => ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence', 'loop,52,21,1', 'loop,52.01,21,2', 'short,52,21,1', 'short,52.02,21.02,2'] })
    expect(courseDetail(schedule, '20', 'short', '2026-09-05')?.shape).toEqual([[52, 21], [52.02, 21.02]])
    expect(courseDetail(schedule, '20', 'loop', '2026-09-02')?.shape).toEqual([[52, 21], [52.01, 21]])
  })
  it('applies removed weekly dates and added exceptions when resolving timetable days', async () => {
    const schedule = await buildSchedule({ ...input, calendars: [{ serviceId: 'S', startDate: '20260901', endDate: '20260930', days: [true, true, true, true, true, false, false] }], calendarDates: [{ serviceId: 'S', date: '20260902', added: false }, { serviceId: 'SAT', date: '20260905', added: true }] })
    expect(courseDetail(schedule, '20', 'loop', '2026-09-02')).toBeNull()
    expect(stopTimetable(schedule, '20', 0, '100101').find((r) => r.tripId === 'loop')?.serviceDate).toBe('2026-09-03')
    expect(courseDetail(schedule, '20', 'loop', '2026-02-31')).toBeNull()
  })
  it('does not turn approximate frequency instances into concrete trip identity', async () => {
    const schedule = await buildSchedule({ ...input, frequencies: [{ tripId: 'loop', startSec: 18000, endSec: 19000, headwaySecs: 300 }] })
    expect(courseDetail(schedule, '20', 'loop', '2026-09-02')).toBeNull()
    expect(stopTimetable(schedule, '20', 0, '100101').some((r) => r.tripId === 'loop')).toBe(false)
  })
  it('interns matching time-offset/NŻ/sequence variants across trips', async () => {
    const schedule = await buildSchedule({ ...input, trips: [...input.trips, { ...input.trips[0], tripId: 'loop2' }], stopTimeLines: [...input.stopTimeLines as string[], 'loop2,25:05:00,25:05:00,100101,1,0,0', 'loop2,25:10:00,25:10:00,200101,2,3,3', 'loop2,25:15:00,25:15:00,100101,3,0,0'] })
    expect(schedule.courseTemplates.get('loop')?.pattern).toBe(schedule.courseTemplates.get('loop2')?.pattern)
  })
})
