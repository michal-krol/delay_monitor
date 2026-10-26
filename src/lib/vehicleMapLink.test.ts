import { describe, expect, it } from 'vitest'
import { parseVehicleMapSelection, vehicleMapHref } from './vehicleMapLink'

describe('vehicle map links', () => {
  const selection = { id: 'V/509/6', tripId: '2026-10-25:509:NdS:6:1314', serviceDate: '2026-10-25' }
  it('round trips an opaque vehicle id, exact trip and service date', () => {
    const href = vehicleMapHref('warszawa', selection)
    expect(href).toContain('/city/warszawa/map?vehicle=V%2F509%2F6&trip=')
    expect(parseVehicleMapSelection(new URL(href, 'https://example.org').searchParams)).toEqual(selection)
  })
  it.each(['vehicle=x', 'vehicle=x&trip=t&date=2026-02-30', 'vehicle=%3Cscript%3E&trip=t&date=2026-10-25', 'vehicle=x&trip=%0A&date=2026-10-25'])('ignores malformed or incomplete parameters: %s', (query) => {
    expect(parseVehicleMapSelection(new URLSearchParams(query))).toBeNull()
  })
})
