import { describe, expect, it } from 'vitest'
import { toRailStationPin, railMarkerBackground, type RailStationApiEntry } from './railStationPin'

function entry(overrides: Partial<RailStationApiEntry> = {}): RailStationApiEntry {
  return {
    id: '33605',
    name: 'Warszawa Centralna',
    lat: 52.2288207,
    lon: 21.00316,
    coordSource: 'station',
    status: 'delayed',
    nextDepartures: [{ plannedAt: '2026-09-23T18:12:00+02:00', headsign: 'Kutno', delayMinutes: 6, status: 'delayed' }],
    ageMs: 5000,
    ...overrides,
  }
}

describe('toRailStationPin', () => {
  it('maps identity fields and marks the pin as rail mode', () => {
    const pin = toRailStationPin(entry())
    expect(pin.id).toBe('33605')
    expect(pin.lat).toBe(52.2288207)
    expect(pin.lon).toBe(21.00316)
    expect(pin.label).toBe('Warszawa Centralna')
    expect(pin.mode).toBe('rail')
    expect(pin.href).toBe('/station/33605')
    expect(pin.status).toBe('delayed')
    expect(pin.coordSource).toBe('station')
  })

  it('formats an on-time departure without a delay suffix', () => {
    const pin = toRailStationPin(entry({ nextDepartures: [{ plannedAt: '2026-09-23T18:12:00+02:00', headsign: 'Kutno', delayMinutes: 0, status: 'onTime' }] }))
    expect(pin.preview).toEqual(['18:12 → Kutno'])
  })

  it('formats a delayed departure with a "+N min" suffix', () => {
    const pin = toRailStationPin(entry({ nextDepartures: [{ plannedAt: '2026-09-23T18:12:00+02:00', headsign: 'Kutno', delayMinutes: 6, status: 'delayed' }] }))
    expect(pin.preview).toEqual(['18:12 → Kutno (+6 min)'])
  })

  it('falls back to an explicit "no data" preview when nextDepartures is null', () => {
    const pin = toRailStationPin(entry({ status: null, nextDepartures: null }))
    expect(pin.preview).toEqual(['Brak danych — otwórz stację'])
  })

  it('falls back to "—" for a departure with no resolvable headsign (BoardRow.headsign: null)', () => {
    const pin = toRailStationPin(entry({ nextDepartures: [{ plannedAt: '2026-09-23T18:12:00+02:00', headsign: null, delayMinutes: 0, status: 'onTime' }] }))
    expect(pin.preview).toEqual(['18:12 → —'])
  })
})

describe('railMarkerBackground', () => {
  it('uses BORDER_COLOR for a known status', () => {
    expect(railMarkerBackground(toRailStationPin(entry({ status: 'delayed' })))).toBe('rgba(234,88,12,0.45)')
    expect(railMarkerBackground(toRailStationPin(entry({ status: 'onTime' })))).toBe('rgba(22,163,74,0.4)')
  })

  it('uses NEUTRAL_PIN_COLOR when status is null (never watched by the poller)', () => {
    expect(railMarkerBackground(toRailStationPin(entry({ status: null, nextDepartures: null })))).toBe('rgba(100,116,139,0.35)')
  })
})
