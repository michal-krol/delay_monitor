import { describe, expect, it } from 'vitest'
import { allLines, lineDetail, linesByMode } from './lines'
import { route, stop, make } from './queryTestHelpers'

describe('linesByMode', () => {
  it('groups routes by mode and sorts line numbers naturally', async () => {
    const schedule = await make({
      routes: [route('10', 0, '10'), route('2', 0, '2'), route('523', 3, '523'), route('M1', 1, 'M1')],
    })
    const grouped = linesByMode(schedule)
    expect(grouped.tram.map((r) => r.shortName)).toEqual(['2', '10'])
    expect(grouped.bus.map((r) => r.shortName)).toEqual(['523'])
    expect(grouped.metro.map((r) => r.shortName)).toEqual(['M1'])
  })
})


describe('allLines', () => {
  it('groups every line by mode, sorted naturally, with the directional long name', async () => {
    const schedule = await make({
      routes: [route('10', 3, '10'), route('2', 3, '2'), route('M1', 1, 'M1')],
    })
    const lines = allLines(schedule)
    expect(lines.bus.map((l) => l.line)).toEqual(['2', '10'])
    expect(lines.metro.map((l) => l.line)).toEqual(['M1'])
    expect(lines.bus[0]).toMatchObject({ routeId: '2', longName: '2' })
    expect(lines.tram).toEqual([])
  })
})


describe('lineDetail', () => {
  it('returns null for an unknown route id', async () => {
    const schedule = await make({})
    expect(lineDetail(schedule, 'nope')).toBeNull()
  })

  it('marks a request stop and carries the street on the line route', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [
        { id: '100101', name: 'Rondo', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: '01', wheelchair: 1, street: 'Marszałkowska' },
        { id: '100201', name: 'Piaski', lat: 52.01, lon: 21.01, locationType: '0', parentId: null, platformCode: '01', wheelchair: 1, street: 'Modlińska' },
      ],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 't', headsign: 'Piaski', directionId: 0 }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence,pickup_type,drop_off_type',
        't,100101,06:00:00,06:00:00,1,0,0',
        't,100201,06:05:00,06:05:00,2,3,3',
      ],
    })
    const dir = schedule.routePatterns.get(`0:0`)
    expect(dir?.onRequest).toEqual([0, 1])

    const detail = lineDetail(schedule, '20')!
    expect(detail.directions[0].stops.map((s) => s.onRequest)).toEqual([false, true])
    expect(detail.directions[0].stops.map((s) => s.street)).toEqual(['Marszałkowska', 'Modlińska'])
  })

  it('carries stop coordinates so the line page can draw the route', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [
        { id: '100101', name: 'Rondo', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: '01', wheelchair: 1, street: null },
        { id: '100201', name: 'Piaski', lat: 52.01, lon: 21.01, locationType: '0', parentId: null, platformCode: '01', wheelchair: 1, street: null },
      ],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 't', headsign: 'Piaski', directionId: 0 }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        't,100101,06:00:00,06:00:00,1',
        't,100201,06:05:00,06:05:00,2',
      ],
    })
    const stops = lineDetail(schedule, '20')!.directions[0].stops
    expect(stops.map((s) => [s.lat, s.lon])).toEqual([[52, 21], [52.01, 21.01]])
  })

  it('builds the representative run for each direction from the schedule', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [stop('100101', 'Centrum 01'), stop('700201', 'Rondo ONZ'), stop('500801', 'Dworzec')],
      trips: [
        { routeId: '20', serviceId: 'S', tripId: 't0', headsign: 'Piaski', directionId: 0 },
        { routeId: '20', serviceId: 'S', tripId: 't1', headsign: 'Międzylesie', directionId: 1 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        't0,100101,12:00:00,12:00:00,1',
        't0,700201,12:06:00,12:06:00,2',
        't0,500801,12:12:00,12:12:00,3',
        't1,500801,12:20:00,12:20:00,1',
        't1,100101,12:32:00,12:32:00,2',
      ],
    })
    const detail = lineDetail(schedule, '20')
    expect(detail).not.toBeNull()
    expect(detail!.mode).toBe('tram')
    expect(detail!.directions.map((d) => d.directionId)).toEqual([0, 1])
    expect(detail!.directions[0]).toMatchObject({ headsign: 'Piaski' })
    // nazwa zespołu oczyszczona z numeru przystanku
    expect(detail!.directions[0].stops.map((s) => s.name)).toEqual(['Centrum', 'Rondo ONZ', 'Dworzec'])
    expect(detail!.directions[0].stops.map((s) => s.groupId)).toEqual(['1001', '7002', '5008'])
    expect(detail!.directions[1].stops.map((s) => s.name)).toEqual(['Dworzec', 'Centrum'])
    expect(detail!.directions[0].origin).toBe('Centrum')
    // odjazdy z krańcówki (100101), pogrupowane po kategorii dnia
    expect(detail!.directions[0].departures).toEqual([{ category: 'weekday', times: [12 * 3600], frequencyBased: false }])
  })

  it('groups terminus departures by day category (weekday / saturday)', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [stop('1001', 'Rondo'), stop('2002', 'Meta')],
      calendarDates: [
        { serviceId: 'PcS', date: '20260902', added: true },
        { serviceId: 'SbS', date: '20260902', added: true },
      ],
      trips: [
        { routeId: '20', serviceId: 'PcS', tripId: 'wd-a', headsign: 'Meta', directionId: 0 },
        { routeId: '20', serviceId: 'PcS', tripId: 'wd-b', headsign: 'Meta', directionId: 0 },
        { routeId: '20', serviceId: 'SbS', tripId: 'sa-a', headsign: 'Meta', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'wd-a,1001,06:00:00,06:00:00,1',
        'wd-a,2002,06:10:00,06:10:00,2',
        'wd-b,1001,06:20:00,06:20:00,1',
        'wd-b,2002,06:30:00,06:30:00,2',
        'sa-a,1001,08:00:00,08:00:00,1',
        'sa-a,2002,08:10:00,08:10:00,2',
      ],
    })
    const blocks = lineDetail(schedule, '20')!.directions[0].departures
    expect(blocks).toEqual([
      { category: 'weekday', times: [6 * 3600, 6 * 3600 + 1200], frequencyBased: false },
      { category: 'saturday', times: [8 * 3600], frequencyBased: false },
    ])
  })

  it('keeps the longest run when trips of one direction differ (short-turns)', async () => {
    const schedule = await make({
      routes: [route('9', 3, '9')],
      stops: [stop('1001', 'A'), stop('2002', 'B'), stop('3003', 'C')],
      trips: [
        { routeId: '9', serviceId: 'S', tripId: 'short', headsign: 'B', directionId: 0 },
        { routeId: '9', serviceId: 'S', tripId: 'full', headsign: 'C', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'short,1001,10:00:00,10:00:00,1',
        'short,2002,10:05:00,10:05:00,2',
        'full,1001,11:00:00,11:00:00,1',
        'full,2002,11:05:00,11:05:00,2',
        'full,3003,11:10:00,11:10:00,3',
      ],
    })
    const detail = lineDetail(schedule, '9')!
    expect(detail.directions).toHaveLength(1)
    expect(detail.directions[0].stops.map((s) => s.groupId)).toEqual(['1001', '2002', '3003'])
  })

  it('covers frequency-based trips (metro pattern)', async () => {
    const schedule = await make({
      routes: [route('M1', 1, 'M1')],
      stops: [stop('7014M:P1', 'Świętokrzyska', '7014M'), stop('100201', 'Kabaty')],
      trips: [{ routeId: 'M1', serviceId: 'S', tripId: 'm', headsign: 'Kabaty', directionId: 0 }],
      frequencies: [{ tripId: 'm', startSec: 5 * 3600, endSec: 5 * 3600 + 1440, headwaySecs: 480 }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'm,7014M:P1,05:00:00,05:00:00,1',
        'm,100201,05:12:00,05:12:00,2',
      ],
    })
    const detail = lineDetail(schedule, 'M1')!
    expect(detail.directions[0].stops.map((s) => s.name)).toEqual(['Świętokrzyska', 'Kabaty'])
  })

  it('returns shape only for the direction that has one, null for its sibling', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [stop('1001', 'A'), stop('2002', 'B')],
      trips: [
        { routeId: '20', serviceId: 'S', tripId: 't0', headsign: 'B', directionId: 0, shapeId: '20-0' },
        { routeId: '20', serviceId: 'S', tripId: 't1', headsign: 'A', directionId: 1 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        't0,1001,06:00:00,06:00:00,1',
        't0,2002,06:10:00,06:10:00,2',
        't1,2002,07:00:00,07:00:00,1',
        't1,1001,07:10:00,07:10:00,2',
      ],
      shapeLines: [
        'shape_id,shape_pt_sequence,shape_pt_lat,shape_pt_lon,shape_dist_traveled',
        '20-0,1,52.1,21.0,0',
        '20-0,2,52.2,21.05,100',
      ],
    })
    const detail = lineDetail(schedule, '20')!
    expect(detail.directions[0].shape).toEqual([[52.1, 21], [52.2, 21.05]])
    expect(detail.directions[1].shape).toBeNull()
  })
})

