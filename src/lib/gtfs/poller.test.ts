import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CityFeed } from './cities'
import { createGtfsPoller } from './poller'
import type { GtfsSchedule } from './types'

const CITY: CityFeed = {
  id: 'test',
  name: 'Test',
  staticUrl: 'https://example.test/f.zip',
  vehiclesUrl: null,
  alertsUrl: null,
  railStationPrefix: 'Test ',
  timezone: 'Europe/Warsaw',
}

function fakeSchedule(serviceDates: [string, string, string], dropped = 0): GtfsSchedule {
  return {
    feedVersion: 'v1',
    serviceDates,
    droppedStopTimes: dropped,
    droppedFrequencies: 0,
  } as GtfsSchedule
}

type Deferred = { resolve: (s: GtfsSchedule) => void; reject: (e: unknown) => void }

function setup(startIso = '2026-09-02T09:00:00Z', idleTtlMs = 30 * 24 * 60 * 60 * 1000) {
  vi.setSystemTime(new Date(startIso))
  const deferreds: Deferred[] = []
  const load = vi.fn(
    () =>
      new Promise<GtfsSchedule>((resolve, reject) => {
        deferreds.push({ resolve, reject })
      })
  )
  const poller = createGtfsPoller({ city: CITY, load, idleTtlMs })
  return { poller, load, deferreds }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createGtfsPoller', () => {
  it('starts exactly one load for many parallel ensureLoaded() calls', async () => {
    const { poller, load, deferreds } = setup()
    poller.ensureLoaded()
    poller.ensureLoaded()
    poller.ensureLoaded()
    expect(load).toHaveBeenCalledTimes(1)
    expect(poller.getView().status).toBe('loading')
    expect(poller.getView().state).toBe('loading')
    expect(poller.getView().droppedRows).toBeNull()

    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03'], 4))
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getView().status).toBe('ready')
    expect(poller.getView().droppedRows).toBe(4)
    expect(poller.getSchedule()).not.toBeNull()
    poller.dispose()
  })

  it('reports failed with no schedule when the first load rejects', async () => {
    const { poller, deferreds } = setup()
    poller.ensureLoaded()
    deferreds[0].reject(new Error('boom'))
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getView().status).toBe('failed')
    expect(poller.getView().state).toBe('failed')
    expect(poller.getSchedule()).toBeNull()

    // Kolejne ensureLoaded() ponawia próbę.
    poller.ensureLoaded()
    await vi.advanceTimersByTimeAsync(0)
    poller.dispose()
  })

  it('keeps serving the previous schedule when a reload fails', async () => {
    const { poller, deferreds } = setup()
    poller.ensureLoaded()
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)

    // Zmiana doby → przeładowanie, które padnie.
    vi.setSystemTime(new Date('2026-09-03T04:00:00Z'))
    poller.ensureLoaded()
    expect(deferreds).toHaveLength(2)
    deferreds[1].reject(new Error('feed down'))
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getView().status).toBe('failed')
    expect(poller.getView().state).toBe('ready') // stary rozkład wciąż serwowany
    expect(poller.getSchedule()).not.toBeNull()
    poller.dispose()
  })

  it('reloads when the service day rolls over (checked hourly, after 03:00 city time)', async () => {
    const { poller, load, deferreds } = setup('2026-09-02T20:00:00Z')
    poller.ensureLoaded()
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)

    // 20:00Z 02.09 → +9 h = 05:00Z 03.09 (07:00 czasu warszawskiego): doba się
    // zmieniła, godzina ≥ 3, godzinowy timer to wychwytuje.
    await vi.advanceTimersByTimeAsync(9 * 60 * 60 * 1000)

    expect(load).toHaveBeenCalledTimes(2)
    poller.dispose()
  })

  it('calls onWake when a load starts and onIdle when the idle timer clears the schedule', async () => {
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z'))
    const onWake = vi.fn()
    const onIdle = vi.fn()
    const deferreds: Deferred[] = []
    const load = vi.fn(
      () =>
        new Promise<GtfsSchedule>((resolve, reject) => {
          deferreds.push({ resolve, reject })
        })
    )
    const poller = createGtfsPoller({
      city: CITY,
      load,
      idleTtlMs: 60 * 60 * 1000,
      onWake,
      onIdle,
    })

    poller.ensureLoaded()
    expect(onWake).toHaveBeenCalledTimes(1)

    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getSchedule()).not.toBeNull()
    expect(onIdle).not.toHaveBeenCalled()

    // Brak zainteresowania przez > idleTtlMs; puść pętlę sprawdzającą.
    vi.setSystemTime(new Date('2026-09-02T11:30:00Z'))
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(poller.getView().status).toBe('idle')
    poller.dispose()
  })

  it('releases the schedule from memory after the idle TTL with no interest', async () => {
    const { poller, deferreds } = setup('2026-09-02T09:00:00Z', 60 * 60 * 1000)
    poller.ensureLoaded()
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getSchedule()).not.toBeNull()

    // Brak zainteresowania przez > idleTtlMs; puść pętlę sprawdzającą.
    vi.setSystemTime(new Date('2026-09-02T11:30:00Z'))
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

    expect(poller.getSchedule()).toBeNull()
    expect(poller.getView().status).toBe('idle')
    expect(poller.getView().droppedRows).toBeNull()
    poller.dispose()
  })
})
