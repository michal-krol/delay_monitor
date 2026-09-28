import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __disposeAllGtfsPollers,
  enabledGtfsCities,
  getGtfsPoller,
  peekAlertPoller,
  peekGtfsPoller,
  peekVehiclePoller,
  warmUpGtfsPollers,
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

  it('spins up an alert poller alongside the schedule poller on first interest', () => {
    expect(peekAlertPoller('warszawa')).toBeNull()
    getGtfsPoller('warszawa')!.ensureLoaded()
    const ap = peekAlertPoller('warszawa')
    expect(ap).not.toBeNull()
    // onWake → ensureRunning() ruszyło pobranie alertów
    expect(['loading', 'ready']).toContain(ap!.getView().state)
  })

  it('disposeAll clears the alert registry too', () => {
    getGtfsPoller('warszawa')!.ensureLoaded()
    expect(peekAlertPoller('warszawa')).not.toBeNull()
    __disposeAllGtfsPollers()
    expect(peekAlertPoller('warszawa')).toBeNull()
  })

  it('enabledGtfsCities lists the registry entries enabled by config', () => {
    expect(enabledGtfsCities().map((city) => city.id)).toEqual(['warszawa'])
  })

  it('peekGtfsPoller is null before interest, resolves to the same instance after', () => {
    expect(peekGtfsPoller('warszawa')).toBeNull()
    const created = getGtfsPoller('warszawa')
    expect(peekGtfsPoller('warszawa')).toBe(created)
  })

  it('disposeAll clears both registries — peek returns null for schedule and vehicle poller alike', () => {
    getGtfsPoller('warszawa')!.ensureLoaded()
    expect(peekGtfsPoller('warszawa')).not.toBeNull()
    expect(peekVehiclePoller('warszawa')).not.toBeNull()

    __disposeAllGtfsPollers()

    expect(peekGtfsPoller('warszawa')).toBeNull()
    expect(peekVehiclePoller('warszawa')).toBeNull()
  })
})

// Task 1 — rozgrzewka wołana z instrumentation.ts przy starcie procesu.
describe('warmUpGtfsPollers', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/config')
    vi.resetModules()
  })

  it('creates a poller per enabled city and starts loading it, fire-and-forget', () => {
    expect(peekGtfsPoller('warszawa')).toBeNull()
    warmUpGtfsPollers()
    const p = peekGtfsPoller('warszawa')
    expect(p).not.toBeNull()
    expect(['loading', 'ready']).toContain(p!.getView().state)
  })

  it('preloads the schedule without waking the vehicle and alert pollers (no viewer = no feed polling)', () => {
    warmUpGtfsPollers()
    const p = peekGtfsPoller('warszawa')!
    expect(p.getView().state).toBe('loading') // rozkład rusza
    expect(peekVehiclePoller('warszawa')!.getView().state).toBe('idle')
    expect(peekAlertPoller('warszawa')!.getView().state).toBe('idle')
  })

  it('is a no-op when GTFS is disabled', async () => {
    vi.resetModules()
    vi.doMock('@/lib/config', () => ({
      loadConfig: () => ({
        gtfs: { enabled: false, cities: [], dataSource: 'mock', idleTtlMs: 1, vehiclePollMs: 1, alertPollMs: 1 },
      }),
    }))
    const mod = await import('./instance')
    mod.warmUpGtfsPollers()
    expect(mod.peekGtfsPoller('warszawa')).toBeNull()
  })
})
