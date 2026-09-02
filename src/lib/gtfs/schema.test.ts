import { describe, expect, it } from 'vitest'
import {
  calendarDateSchema,
  contrastText,
  frequencySchema,
  modeFromRouteType,
  normalizeRouteColor,
  parseGtfsSeconds,
  routeSchema,
  stopSchema,
} from './schema'

describe('normalizeRouteColor', () => {
  it('accepts 6-hex and lowercases to #rrggbb', () => {
    expect(normalizeRouteColor('0000BB')).toBe('#0000bb')
  })

  it('rejects anything else to null — raw string never escapes', () => {
    for (const bad of [undefined, '', 'red', '#0000BB', '0000B', 'javascript:x', '0000bb;']) {
      expect(normalizeRouteColor(bad), String(bad)).toBeNull()
    }
  })
})

describe('contrastText', () => {
  it('picks black on light fills, white on dark', () => {
    expect(contrastText('#ffffff')).toBe('#000000')
    expect(contrastText('#f2c811')).toBe('#000000') // żółty — czarny tekst
    expect(contrastText('#0000bb')).toBe('#ffffff') // granat — biały tekst
    expect(contrastText('#bb0000')).toBe('#ffffff')
  })

  it('defaults to black when there is no colour', () => {
    expect(contrastText(null)).toBe('#000000')
  })
})

describe('modeFromRouteType', () => {
  it('maps the Warsaw types and a few HVT ranges', () => {
    expect(modeFromRouteType(0)).toBe('tram')
    expect(modeFromRouteType(1)).toBe('metro')
    expect(modeFromRouteType(2)).toBe('rail')
    expect(modeFromRouteType(3)).toBe('bus')
    expect(modeFromRouteType(700)).toBe('bus')
    expect(modeFromRouteType(109)).toBe('rail')
    expect(modeFromRouteType(999)).toBe('other')
  })
})

describe('parseGtfsSeconds', () => {
  it('parses H+:MM:SS including past 24:00', () => {
    expect(parseGtfsSeconds('05:08:00')).toBe(5 * 3600 + 8 * 60)
    expect(parseGtfsSeconds('25:10:00')).toBe(25 * 3600 + 10 * 60)
  })

  it('returns null on anything malformed', () => {
    for (const bad of ['5:8', '05:60:00', '', 'now', '05:00:00Z', '-1:00:00']) {
      expect(parseGtfsSeconds(bad), bad).toBeNull()
    }
  })
})

describe('routeSchema', () => {
  it('drops an invalid colour to null and computes text colour', () => {
    const route = routeSchema.parse({
      route_id: 'M1',
      route_short_name: 'M1',
      route_type: '1',
      route_color: 'nonsense',
    })
    expect(route.color).toBeNull()
    expect(route.mode).toBe('metro')
    expect(route.textColor).toBe('#000000')
  })
})

describe('stopSchema', () => {
  it('keeps wheelchair_boarding tri-state (0 = unknown, not "no")', () => {
    expect(stopSchema.parse({ stop_id: '1', wheelchair_boarding: '0' }).wheelchair).toBe(0)
    expect(stopSchema.parse({ stop_id: '1', wheelchair_boarding: '' }).wheelchair).toBe(0)
    expect(stopSchema.parse({ stop_id: '1', wheelchair_boarding: '1' }).wheelchair).toBe(1)
    expect(stopSchema.parse({ stop_id: '1', wheelchair_boarding: '2' }).wheelchair).toBe(2)
  })

  it('carries parent_station only when non-empty', () => {
    expect(stopSchema.parse({ stop_id: '7014M:P1', parent_station: '7014M' }).parentId).toBe('7014M')
    expect(stopSchema.parse({ stop_id: '1001', parent_station: '' }).parentId).toBeNull()
  })
})

describe('frequencySchema', () => {
  it('parses the boundary case row', () => {
    const freq = frequencySchema.parse({
      trip_id: 'M1:NdM:KAB',
      start_time: '05:00:00',
      end_time: '05:23:00',
      headway_secs: '480',
    })
    expect(freq).toEqual({ tripId: 'M1:NdM:KAB', startSec: 18000, endSec: 19380, headwaySecs: 480 })
  })
})

describe('calendarDateSchema', () => {
  it('reads exception_type as added/removed', () => {
    expect(calendarDateSchema.parse({ service_id: '2026-09-02:PcS', date: '20260902', exception_type: '1' }).added).toBe(
      true
    )
    expect(calendarDateSchema.parse({ service_id: 'x', date: '20260902', exception_type: '2' }).added).toBe(false)
  })
})
