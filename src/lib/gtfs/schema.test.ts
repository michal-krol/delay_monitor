import { describe, expect, it } from 'vitest'
import {
  calendarDateSchema,
  contrastText,
  frequencySchema,
  lineKindFrom,
  modeFromRouteType,
  normalizeRouteColor,
  parseGtfsSeconds,
  routeSchema,
  serviceCategory,
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

describe('lineKindFrom', () => {
  it('reads route_desc first', () => {
    expect(lineKindFrom('16', 'linia nocna')).toBe('night')
    expect(lineKindFrom('7', 'komunikacja zastępcza')).toBe('replacement')
    expect(lineKindFrom('9', 'linia przyspieszona')).toBe('express')
  })

  it('falls back to the ZTM number convention', () => {
    expect(lineKindFrom('N16', undefined)).toBe('night')
    expect(lineKindFrom('Z1', undefined)).toBe('replacement')
    expect(lineKindFrom('521', undefined)).toBe('express')
    expect(lineKindFrom('E-1', undefined)).toBe('express')
    expect(lineKindFrom('128', undefined)).toBe('regular')
    expect(lineKindFrom('20', undefined)).toBe('regular')
    expect(lineKindFrom('M1', undefined)).toBe('regular') // M ≠ night
  })
})

describe('routeSchema — rodzaj linii', () => {
  it('derives kind from the short name', () => {
    expect(routeSchema.parse({ route_id: 'r', route_short_name: 'N16', route_type: '3' }).kind).toBe('night')
    expect(routeSchema.parse({ route_id: 'r', route_short_name: '128', route_type: '3' }).kind).toBe('regular')
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

describe('serviceCategory', () => {
  it('reads the WTP token in the service_id, dated or bare', () => {
    expect(serviceCategory('2026-09-05:SbS')).toBe('saturday')
    expect(serviceCategory('NdM')).toBe('sunday')
    expect(serviceCategory('2026-09-04:PtS')).toBe('friday')
    expect(serviceCategory('PcM')).toBe('weekday')
  })

  it('falls back to the weekday spread of the active dates (feed with calendar.txt)', () => {
    // gtfsWeekday: 0 pon … 4 pt, 5 sob, 6 niedz
    expect(serviceCategory('S1', new Set([0, 1, 2, 3, 4]))).toBe('weekday')
    expect(serviceCategory('S2', new Set([5]))).toBe('saturday')
    expect(serviceCategory('S3', new Set([6]))).toBe('sunday')
    expect(serviceCategory('S4', new Set([4]))).toBe('friday')
  })

  it('returns "other" when neither the token nor the weekday spread decides', () => {
    expect(serviceCategory('holiday-2026')).toBe('other')
    expect(serviceCategory('mix', new Set([4, 6]))).toBe('other')
  })
})
