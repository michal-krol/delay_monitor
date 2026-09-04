import { afterEach, describe, expect, it } from 'vitest'
import {
  __disposeAllGtfsPollers,
  enabledGtfsCities,
  getGtfsPoller,
  peekVehiclePoller,
} from './instance'

afterEach(() => {
  __disposeAllGtfsPollers()
})

describe('gtfs instance registry', () => {
  it('creates one poller per city, memoised', () => {
    const first = getGtfsPoller('warszawa')
    const second = getGtfsPoller('warszawa')
    expect(first).not.toBeNull()
    expect(first).toBe(second)
  })

  it('returns null for a city outside the registry or GTFS_CITIES', () => {
    expect(getGtfsPoller('nope')).toBeNull()
    expect(getGtfsPoller('krakow')).toBeNull() // w rejestrze? nie; w GTFS_CITIES? nie
  })

  it('spins up a vehicle poller alongside the schedule poller on first interest', () => {
    expect(peekVehiclePoller('warszawa')).toBeNull()
    getGtfsPoller('warszawa')!.ensureLoaded()
    const vp = peekVehiclePoller('warszawa')
    expect(vp).not.toBeNull()
    // onWake → ensureRunning() ruszyło pobranie pozycji
    expect(['loading', 'ready']).toContain(vp!.getView().state)
  })

  it('enabledGtfsCities lists the registry entries enabled by config', () => {
    expect(enabledGtfsCities().map((city) => city.id)).toEqual(['warszawa'])
  })
})
