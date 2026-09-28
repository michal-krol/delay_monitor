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
  mapCenter: { lat: 52.23, lon: 21.01 },
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

function setup(
  startIso = '2026-09-02T09:00:00Z',
  idleTtlMs = 30 * 24 * 60 * 60 * 1000,
  extraDeps: Partial<Parameters<typeof createGtfsPoller>[0]> = {}
) {
  vi.setSystemTime(new Date(startIso))
  const deferreds: Deferred[] = []
  const load = vi.fn(
    () =>
      new Promise<GtfsSchedule>((resolve, reject) => {
        deferreds.push({ resolve, reject })
      })
  )
  const poller = createGtfsPoller({ city: CITY, load, idleTtlMs, ...extraDeps })
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

  it('re-arms the idle timer after an idle-clear so a later idle period fires onIdle again', async () => {
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z'))
    const onIdle = vi.fn()
    const deferreds: Deferred[] = []
    const load = vi.fn(
      () => new Promise<GtfsSchedule>((resolve, reject) => { deferreds.push({ resolve, reject }) })
    )
    const poller = createGtfsPoller({ city: CITY, load, idleTtlMs: 60 * 60 * 1000, onIdle })

    poller.ensureLoaded()
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)

    // First idle period.
    vi.setSystemTime(new Date('2026-09-02T11:30:00Z'))
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(poller.getView().status).toBe('idle')

    // Fresh interest re-arms the idle machinery.
    poller.ensureLoaded()
    deferreds[1].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getSchedule()).not.toBeNull()

    // Second idle period must fire onIdle again.
    vi.setSystemTime(new Date('2026-09-02T14:30:00Z'))
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    expect(onIdle).toHaveBeenCalledTimes(2)
    poller.dispose()
  })

  it('fires onIdle when interest is lost even if the static feed never loaded', async () => {
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z'))
    const onIdle = vi.fn()
    const deferreds: Deferred[] = []
    const load = vi.fn(
      () => new Promise<GtfsSchedule>((resolve, reject) => { deferreds.push({ resolve, reject }) })
    )
    const poller = createGtfsPoller({ city: CITY, load, idleTtlMs: 60 * 60 * 1000, onIdle })

    poller.ensureLoaded()
    deferreds[0].reject(new Error('feed down'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getSchedule()).toBeNull()
    expect(poller.getView().status).toBe('failed')

    vi.setSystemTime(new Date('2026-09-02T11:30:00Z'))
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    poller.dispose()
  })

  // Task 1 — warm-up: `keepSchedule` (miasto rozgrzane przez instrumentation.ts).
  it('keeps the schedule, status and reload timer resident past idle expiry when keepSchedule is true, but still fires onIdle', async () => {
    const onIdle = vi.fn()
    const { poller, deferreds } = setup('2026-09-02T09:00:00Z', 60 * 60 * 1000, { onIdle, keepSchedule: true })
    poller.ensureLoaded()
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getSchedule()).not.toBeNull()

    // Brak zainteresowania przez > idleTtlMs.
    vi.setSystemTime(new Date('2026-09-02T11:30:00Z'))
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

    expect(onIdle).toHaveBeenCalledTimes(1) // poller pozycji/alertów i tak się zatrzymuje
    expect(poller.getSchedule()).not.toBeNull() // ale rozkład NIE jest zwalniany
    expect(poller.getView().status).toBe('ready')
    poller.dispose()
  })

  it('keeps the hourly reload timer armed for a kept schedule past idle expiry (day rollover still reloads)', async () => {
    const { poller, load, deferreds } = setup('2026-09-02T20:00:00Z', 60 * 60 * 1000, { keepSchedule: true })
    poller.ensureLoaded()
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)

    // 20:00Z 02.09 → +9 h = 05:00Z 03.09 (07:00 czasu warszawskiego): doba się
    // zmieniła i minął próg idleTtlMs (1h) po drodze — rozkład mimo to musi
    // się przeładować, bo `reloadTimer` nie został wyczyszczony.
    await vi.advanceTimersByTimeAsync(9 * 60 * 60 * 1000)

    expect(load).toHaveBeenCalledTimes(2)
    poller.dispose()
  })

  it('re-fires onWake for renewed interest after a keepSchedule idle-stop, without refetching the kept schedule', async () => {
    const onWake = vi.fn()
    const onIdle = vi.fn()
    const { poller, load, deferreds } = setup('2026-09-02T09:00:00Z', 60 * 60 * 1000, {
      onWake,
      onIdle,
      keepSchedule: true,
    })
    poller.ensureLoaded()
    expect(onWake).toHaveBeenCalledTimes(1)
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)

    vi.setSystemTime(new Date('2026-09-02T11:30:00Z'))
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(poller.getSchedule()).not.toBeNull()

    // Widz wraca: poller pozycji/alertów musi się obudzić od nowa, ale
    // rozkład jest ciepły — bez ponownego ładowania.
    poller.ensureLoaded()
    expect(onWake).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenCalledTimes(1)
    poller.dispose()
  })

  // Fix round 1 (code review CRITICAL 1): godzinowy timer przeładowania nie
  // ma prawa budzić pollerów pozycji/alertów sam z siebie — tylko widz
  // (`ensureLoaded()`) budzi. Inaczej przeładowanie doby dla rozkładu
  // trzymanego w pamięci (`keepSchedule`) po idle-stopie wskrzeszałoby
  // poller pozycji na zawsze (idle timer jest wyczyszczony po idle-stopie,
  // re-uzbraja go tylko `ensureLoaded()`) — bez widza, złamanie decyzji
  // właściciela o zerowym pollingu 24/7.
  it('does not wake vehicle/alert pollers for a day-rollover reload while idle-stopped — only a returning viewer wakes them', async () => {
    const onWake = vi.fn()
    const onIdle = vi.fn()
    const { poller, load, deferreds } = setup('2026-09-02T20:00:00Z', 60 * 60 * 1000, {
      onWake,
      onIdle,
      keepSchedule: true,
    })

    poller.ensureLoaded()
    expect(onWake).toHaveBeenCalledTimes(1) // pierwszy widz budzi normalnie
    deferreds[0].resolve(fakeSchedule(['2026-09-01', '2026-09-02', '2026-09-03']))
    await vi.advanceTimersByTimeAsync(0)

    // Brak zainteresowania > idleTtlMs (1h) -> idle-stop w tle.
    await vi.advanceTimersByTimeAsync(70 * 60 * 1000) // 20:00Z + 70min = 21:10Z
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(onWake).toHaveBeenCalledTimes(1) // idle-stop NIE budzi

    // Doba się zmienia i mija próg RELOAD_HOUR (03:00 czasu warszawskiego) —
    // godzinowy timer przeładowuje rozkład SAM Z SIEBIE, bez widza.
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000) // do ~05:10Z (07:10 Warszawa)
    expect(load).toHaveBeenCalledTimes(2) // przeładowanie doby faktycznie ruszyło
    expect(onWake).toHaveBeenCalledTimes(1) // ale BEZ budzenia pollerów — kluczowa asercja

    // Widz wraca: teraz onWake się odpala, a timer bezczynności wraca do życia.
    poller.ensureLoaded()
    expect(onWake).toHaveBeenCalledTimes(2)

    // Drugi okres bezczynności musi znów odpalić onIdle — idle timer faktycznie działa.
    await vi.advanceTimersByTimeAsync(65 * 60 * 1000)
    expect(onIdle).toHaveBeenCalledTimes(2)

    poller.dispose()
  })
})
