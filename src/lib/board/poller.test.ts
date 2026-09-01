import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller, mergeUpstreamStops } from './poller'
import { PkpApiError } from '../pkp/client'
import type { RawRoute, RawTrainOperation } from '../pkp/types'
import { MAX_AUX_STATIONS } from './upstreamEstimate'
import { makePkpClient } from '@/test-utils/pkpClient'

function makeTrain(scheduleId: string, orderId: string, stationId: string): RawTrainOperation {
  return {
    scheduleId,
    orderId,
    trainOrderId: null,
    operatingDate: '2026-08-01',
    trainStatus: null,
    stations: [
      {
        stationId,
        plannedArrival: null,
        actualArrival: null,
        plannedDeparture: new Date(Date.now() + 5 * 60000).toISOString(),
        actualDeparture: null,
        arrivalDelayMinutes: null,
        departureDelayMinutes: null,
        isCancelled: false,
        isConfirmed: false,
      },
    ],
  }
}

/** Pociąg "w trasie" na `stationId`: `trainStatus` w drodze, ten przystanek jeszcze niepotwierdzony. */
function makeEnRouteTrain(scheduleId: string, orderId: string, stationId: string): RawTrainOperation {
  return {
    scheduleId,
    orderId,
    trainOrderId: null,
    operatingDate: '2026-08-01',
    trainStatus: 'P',
    stations: [
      {
        stationId,
        plannedArrival: null,
        actualArrival: null,
        plannedDeparture: new Date(Date.now() + 5 * 60000).toISOString(),
        actualDeparture: null,
        arrivalDelayMinutes: null,
        departureDelayMinutes: null,
        isCancelled: false,
        isConfirmed: false,
      },
    ],
  }
}

/** Ta sama realizacja co `makeEnRouteTrain`, ale z tym przystankiem już potwierdzonym. */
function makeConfirmedTrain(scheduleId: string, orderId: string, stationId: string): RawTrainOperation {
  const t = makeEnRouteTrain(scheduleId, orderId, stationId)
  return { ...t, stations: [{ ...t.stations[0], isConfirmed: true, actualDeparture: t.stations[0].plannedDeparture }] }
}

function routeStop(stationId: string) {
  return {
    stationId,
    arrivalPlatform: null,
    arrivalTrack: null,
    departurePlatform: null,
    departureTrack: null,
    arrivalTime: null,
    departureTime: null,
    arrivalDay: null,
    departureDay: null,
    stopTypeName: null,
  }
}

function routeWithUpstream(scheduleId: string, orderId: string, upstreamStationId: string, stationId: string): RawRoute {
  return {
    scheduleId,
    orderId,
    trainOrderId: null,
    carrierCode: null,
    commercialCategorySymbol: null,
    name: null,
    nationalNumber: null,
    operatingDates: [],
    stations: [routeStop(upstreamStationId), routeStop(stationId)],
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-01T12:00:00+02:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createPoller', () => {
  it('wakes and fires immediately on the first registerInterest call', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(poller.isAwake()).toBe(true)
  })

  it('merges multiple stations into a single request', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100', '5136'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(getOperations).toHaveBeenCalledWith(['5100', '5136'])
  })

  it('sleeps after interestTtlMs of silence', async () => {
    const client = makePkpClient()
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.isAwake()).toBe(true)

    await vi.advanceTimersByTimeAsync(300000)
    await vi.advanceTimersByTimeAsync(90000)

    expect(poller.isAwake()).toBe(false)
  })

  it('does not fire when the active set is empty', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    await vi.advanceTimersByTimeAsync(200000)

    expect(getOperations).not.toHaveBeenCalled()
    expect(poller.isAwake()).toBe(false)
  })

  it('does not start a second concurrent fetch while one is already in flight', async () => {
    // `timer` jest `null` przez cały czas trwania runTick(), nie tylko
    // podczas snu -- registerInterest() wywołane w trakcie trwającego
    // zapytania widziałoby wasAsleep i wystrzeliwało drugi fetch bez
    // ochrony tickInFlight.
    let resolveFetch: (value: { trains: never[]; stationNames: object; budget: { hourly: number; daily: number } }) => void
    const pending = new Promise((resolve) => {
      resolveFetch = resolve
    })
    const getOperations = vi.fn().mockReturnValue(pending)
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    // Wciąż w locie (timer nadal null) -- to wywołanie nie powinno dodać drugiego fetcha.
    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    resolveFetch!({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.isAwake()).toBe(true)
  })

  it('respects the 45s throttle when all requested stations already have data', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10000)
    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
  })

  it('bypasses the throttle immediately when a newly watched station has no data yet', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10000)
    poller.registerInterest(['5136'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(2)
    expect(getOperations).toHaveBeenLastCalledWith(['5100', '5136'])
  })

  it('schedules a fast follow-up when a newly watched station reveals upstream aux candidates', async () => {
    // Odtwarza błąd zaobserwowany na żywo (staging): stacja obserwowana po
    // raz pierwszy nie ma jeszcze stacji pomocniczych, więc pociąg naprawdę
    // już jadący (en-route, niepotwierdzony na TEJ stacji) pokazywał się jako
    // "jeszcze nie wyjechał" aż do następnego zwykłego cyklu (pełne 90 s).
    const train = makeEnRouteTrain('26', '1', '5100')
    const getOperations = vi.fn().mockResolvedValue({ trains: [train], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const getSchedules = vi.fn().mockResolvedValue({ routes: [routeWithUpstream('26', '1', '4900', '5100')], carrierNames: {} })
    const client = makePkpClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(getOperations).toHaveBeenLastCalledWith(['5100'])

    // Zwykły interwał (90 s) jeszcze nie minął, ale odkryliśmy kandydata
    // pomocniczego ('4900') dla świeżo obserwowanej '5100' -- powinno wymusić
    // szybkie powtórzenie znacznie wcześniej niż pełny interwał.
    await vi.advanceTimersByTimeAsync(2000)
    expect(getOperations).toHaveBeenCalledTimes(2)
    expect(getOperations).toHaveBeenLastCalledWith(['5100', '4900'])

    // I nie zapętla się -- trzeci przebieg czeka już na pełny, zwykły interwał.
    await vi.advanceTimersByTimeAsync(2000)
    expect(getOperations).toHaveBeenCalledTimes(2)
  })

  it('does not schedule a fast follow-up for a station that already had a snapshot', async () => {
    const train = makeEnRouteTrain('26', '1', '5100')
    const getOperations = vi.fn().mockResolvedValue({ trains: [train], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const getSchedules = vi.fn().mockResolvedValue({ routes: [routeWithUpstream('26', '1', '4900', '5100')], carrierNames: {} })
    const client = makePkpClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2000) // pochłania sam fast follow-up z pierwszego cyklu
    expect(getOperations).toHaveBeenCalledTimes(2)

    // Ta sama stacja rejestrowana ponownie znacznie później (poza dławikiem
    // 45 s) -- ma już snapshot, więc kolejny fast follow-up jej nie dotyczy.
    await vi.advanceTimersByTimeAsync(50000)
    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(2000)
    expect(getOperations).toHaveBeenCalledTimes(3) // brak dodatkowego szybkiego powtórzenia
  })

  it('forces a run once 45s have passed since the last run, even for a station that already has data', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(46000)
    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(2)
    expect(getOperations).toHaveBeenLastCalledWith(['5100'])
  })

  it('extends the interval to 5 minutes when daily budget drops below 50', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 5, daily: 40 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(90000)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(210000)
    expect(getOperations).toHaveBeenCalledTimes(2)
  })

  it('keeps the normal interval when the API sends no rate-limit headers', async () => {
    // Regresja: brak nagłówka dawał wcześniej daily=0, co natychmiast i na
    // stałe spychało poller na interwał awaryjny 5 minut.
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: null, daily: null } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(90000)
    expect(getOperations).toHaveBeenCalledTimes(2)
  })

  it('extends the interval when the hourly budget runs low even if the daily one is healthy', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 4, daily: 900 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(90000)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(210000)
    expect(getOperations).toHaveBeenCalledTimes(2)
  })

  it('trusts the client for retry resilience instead of retrying getOperations itself', async () => {
    // Ponowienie po 5xx żyje teraz w `client.ts` (`fetchJsonWithRetry`),
    // wspólne dla wszystkich zapytań do PKP -- nie tylko `getOperations`, jak
    // wcześniej ten sam mechanizm ręcznie owinięty tu, w pollerze. Poller woła
    // `client.getOperations()` dokładnie raz na przebieg i ufa, że klient sam
    // sobie poradzi z przejściową awarią; patrz `client.test.ts` dla testów
    // samego ponowienia.
    const getOperations = vi.fn().mockRejectedValue(new PkpApiError('boom', 500))
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(poller.getStatus()).toBe('degraded')
  })

  it('caps how many upstream calls a stream of unknown stations can force', async () => {
    // Kazde nowe ID omijalo dlawik 45 s, wiec seria zadan o kolejne stacje
    // zamieniala sie 1:1 na zapytania do PKP. Limit 100/h dalo sie w ten sposob
    // wyczerpac w 100 zadaniach i zdegradowac aplikacje dla wszystkich.
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    for (let i = 0; i < 60; i += 1) {
      poller.registerInterest([`station-${i}`])
      await vi.advanceTimersByTimeAsync(10)
    }

    // Bez limitu byloby ok. 60 wywolan; z limitem znaczaco mniej.
    expect(getOperations.mock.calls.length).toBeLessThanOrEqual(12)
  })

  it('caps the number of simultaneously watched stations, evicting the oldest first', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({
      client,
      config: { pollIntervalMs: 90000, interestTtlMs: 300000, maxWatchedStations: 3 },
      stationNames: new Map(),
    })

    poller.registerInterest(['a', 'b', 'c'])
    await vi.advanceTimersByTimeAsync(0)

    // Poczekaj, aż dławik 45 s minie, żeby kolejna rejestracja wywołała realny przebieg.
    await vi.advanceTimersByTimeAsync(45000)
    poller.registerInterest(['d'])
    await vi.advanceTimersByTimeAsync(0)

    const lastCallStations = getOperations.mock.calls[getOperations.mock.calls.length - 1][0] as string[]
    expect(lastCallStations).not.toContain('a') // najstarsza, wyeksmitowana przy pełnej pojemności
    expect(lastCallStations).toEqual(expect.arrayContaining(['b', 'c', 'd']))
  })

  it('still fetches immediately for the first few new stations', async () => {
    // Limit nie moze psuc normalnego uzycia: dodanie kilku ulubionych stacji
    // ma nadal dawac dane od razu, bez czekania na kolejny przebieg.
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(10)
    expect(getOperations).toHaveBeenCalledTimes(1)

    poller.registerInterest(['5100', '5136'])
    await vi.advanceTimersByTimeAsync(10)
    expect(getOperations).toHaveBeenCalledTimes(2)

    poller.registerInterest(['5100', '5136', '4900'])
    await vi.advanceTimersByTimeAsync(10)
    expect(getOperations).toHaveBeenCalledTimes(3)
  })

  it('lets the forced-run budget recover after the window passes', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    for (let i = 0; i < 40; i += 1) {
      poller.registerInterest([`a-${i}`])
      await vi.advanceTimersByTimeAsync(10)
    }
    const afterBurst = getOperations.mock.calls.length

    // Po przejsciu okna pula wymuszen odbudowuje sie.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    const afterIdle = getOperations.mock.calls.length

    poller.registerInterest(['zupelnie-nowa'])
    await vi.advanceTimersByTimeAsync(10)

    expect(getOperations.mock.calls.length).toBeGreaterThan(afterIdle)
    expect(afterBurst).toBeLessThanOrEqual(12)
  })

  it('reports throttling only once it actually slowed down', async () => {
    const getOperations = vi
      .fn()
      .mockResolvedValueOnce({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
      .mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 10 } })
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.isThrottled()).toBe(false)
    // Sam bool nie mówi „o ile" — panel diagnostyczny pokazuje tempo, więc
    // poller musi je udostępniać, nie tylko fakt zdławienia.
    expect(poller.getIntervalMs()).toBe(90000)

    await vi.advanceTimersByTimeAsync(90000)
    expect(poller.isThrottled()).toBe(true)
    expect(poller.getIntervalMs()).toBeGreaterThan(90000)
  })

  it('keeps the previous snapshot when a request fails', async () => {
    const goodTrains = [makeTrain('25', '1', '5100')]
    const getOperations = vi
      .fn()
      .mockResolvedValueOnce({ trains: goodTrains, stationNames: { '5100': 'Warszawa Centralna' }, budget: { hourly: 99, daily: 999 } })
      .mockRejectedValueOnce(new PkpApiError('boom', 500))
    const client = makePkpClient({ getOperations })
    const poller = createPoller({
      client,
      config: { pollIntervalMs: 90000, interestTtlMs: 300000 },
      stationNames: new Map([['5100', 'Warszawa Centralna']]),
    })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    const goodSnapshot = poller.getSnapshot('5100')
    expect(goodSnapshot?.departures).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(90000)

    expect(poller.getSnapshot('5100')).toEqual(goodSnapshot)
    expect(poller.getStatus()).toBe('degraded')
  })

  it('stops polling on a 401 and reports configError', async () => {
    const getOperations = vi.fn().mockRejectedValue(new PkpApiError('unauthorized', 401))
    const client = makePkpClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getStatus()).toBe('configError')
    expect(poller.isAwake()).toBe(false)
  })

  it('joins schedules onto operations by scheduleId-orderId to fill carrier and category', async () => {
    const getOperations = vi.fn().mockResolvedValue({
      trains: [makeTrain('26', '12345', '5100')],
      stationNames: { '5100': 'Warszawa Centralna' },
      budget: { hourly: 99, daily: 999 },
    })
    const getSchedules = vi.fn().mockResolvedValue({
      routes: [
        { scheduleId: '26', orderId: '12345', carrierCode: 'PKP_IC', commercialCategorySymbol: 'EIC', name: null, nationalNumber: null, operatingDates: [], stations: [] },
      ],
      carrierNames: {},
    })
    const client = makePkpClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const row = poller.getSnapshot('5100')?.departures[0]
    expect(row?.carrier).toBe('PKP_IC')
    expect(row?.category).toBe('EIC')
  })

  it('resolves headsign from the schedules station dictionary merged with operations\' own (fullRoutes is off on /operations)', async () => {
    const getOperations = vi.fn().mockResolvedValue({
      trains: [makeTrain('26', '12345', '5100')],
      stationNames: { '5100': 'Warszawa Centralna' },
      budget: { hourly: 99, daily: 999 },
    })
    const getSchedules = vi.fn().mockResolvedValue({
      routes: [
        {
          scheduleId: '26',
          orderId: '12345',
          trainOrderId: null,
          carrierCode: 'IC',
          commercialCategorySymbol: 'EIC',
          name: null,
          nationalNumber: null,
          stations: [
            { stationId: '5100', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null },
            { stationId: '5136', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null },
          ],
        },
      ],
      carrierNames: {},
      stationNames: { '5136': 'Kraków Główny' },
    })
    const client = makePkpClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const row = poller.getSnapshot('5100')?.departures[0]
    expect(row?.headsign).toBe('Kraków Główny')
  })

  it('joins schedules onto operations via trainOrderId when the route key differs from scheduleId-orderId', async () => {
    const getOperations = vi.fn().mockResolvedValue({
      trains: [{ ...makeTrain('26', '366302732', '5100'), trainOrderId: '12345' }],
      stationNames: { '5100': 'Warszawa Centralna' },
      budget: { hourly: 99, daily: 999 },
    })
    const getSchedules = vi.fn().mockResolvedValue({
      routes: [
        {
          scheduleId: '26',
          orderId: '12345',
          trainOrderId: null,
          carrierCode: 'IC',
          commercialCategorySymbol: 'EIC',
          name: 'KASZUB',
          nationalNumber: null,
          stations: [],
        },
      ],
      carrierNames: {},
    })
    const client = makePkpClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const row = poller.getSnapshot('5100')?.departures[0]
    expect(row?.carrier).toBe('IC')
    expect(row?.trainLabel).toBe('KASZUB')
  })

  it('keeps operations data and status ok even when the schedules fetch fails', async () => {
    const getOperations = vi.fn().mockResolvedValue({
      trains: [makeTrain('26', '12345', '5100')],
      stationNames: { '5100': 'Warszawa Centralna' },
      budget: { hourly: 99, daily: 999 },
    })
    const getSchedules = vi.fn().mockRejectedValue(new PkpApiError('boom', 500))
    const client = makePkpClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const row = poller.getSnapshot('5100')?.departures[0]
    expect(row).toBeDefined()
    expect(row?.carrier).toBe('')
    expect(poller.getStatus()).toBe('ok')
  })

  describe('disruptions', () => {
    it('marks a row hasDisruption when getDisruptions returns a matching affectedRoute', async () => {
      const getOperations = vi.fn().mockResolvedValue({
        trains: [makeTrain('26', '12345', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      })
      const getDisruptions = vi.fn().mockResolvedValue({
        disruptions: [{ disruptionId: 1, message: 'utr_40', affectedRoutes: [{ scheduleId: '26', orderId: '12345', operatingDate: '2026-08-01', stationId: '5100' }] }],
        disruptionTypes: { utr_40: 'Awaria sieci trakcyjnej' },
      })
      const client = makePkpClient({ getOperations, getDisruptions })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)

      expect(poller.getSnapshot('5100')?.departures[0]?.hasDisruption).toBe(true)
    })

    it('calls getDisruptions with the real active stations, not the aux stations added to /operations', async () => {
      const getOperations = vi.fn().mockResolvedValue({
        trains: [makeTrain('26', '12345', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      })
      const getDisruptions = vi.fn().mockResolvedValue({ disruptions: [], disruptionTypes: {} })
      const client = makePkpClient({ getOperations, getDisruptions })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)

      expect(getDisruptions).toHaveBeenCalledWith(['5100'])
    })

    it('degrades gracefully when getDisruptions rejects -- rest of the tick still succeeds, status stays ok', async () => {
      const getOperations = vi.fn().mockResolvedValue({
        trains: [makeTrain('26', '12345', '5100')],
        stationNames: { '5100': 'Warszawa Centralna' },
        budget: { hourly: 99, daily: 999 },
      })
      const getDisruptions = vi.fn().mockRejectedValue(new PkpApiError('boom', 500))
      const client = makePkpClient({ getOperations, getDisruptions })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)

      const row = poller.getSnapshot('5100')?.departures[0]
      expect(row).toBeDefined()
      expect(row?.hasDisruption).toBe(false)
      expect(poller.getStatus()).toBe('ok')
    })
  })

  describe('upstream (aux) stations for the enRoute delay estimate', () => {
    it('adds the upstream station to /operations starting the tick AFTER discovering an enRoute connection, not the same tick', async () => {
      const getOperations = vi.fn().mockResolvedValue({
        trains: [makeEnRouteTrain('25', '1', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      })
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)
      expect(getOperations).toHaveBeenNthCalledWith(1, ['5100'])

      await vi.advanceTimersByTimeAsync(90000)
      expect(getOperations).toHaveBeenNthCalledWith(2, ['5100', 'upstream'])
    })

    it('keeps /schedules querying only real stations, even once an aux station is being tracked (stable 24h cache key)', async () => {
      const getOperations = vi.fn().mockResolvedValue({
        trains: [makeEnRouteTrain('25', '1', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      })
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(90000)

      expect(getSchedules).toHaveBeenNthCalledWith(1, ['5100'])
      expect(getSchedules).toHaveBeenNthCalledWith(2, ['5100'])
    })

    it('never exposes a snapshot for the aux (upstream) station -- it is not something anyone asked to watch', async () => {
      const getOperations = vi.fn().mockResolvedValue({
        trains: [makeEnRouteTrain('25', '1', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      })
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(90000)

      expect(poller.getSnapshot('upstream')).toBeUndefined()
    })

    it('drops the upstream station from /operations once the tracked stop becomes confirmed', async () => {
      const getOperations = vi
        .fn()
        .mockResolvedValueOnce({ trains: [makeEnRouteTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 } })
        .mockResolvedValueOnce({ trains: [makeConfirmedTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 } })
        .mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0) // tick 1: discovers enRoute -> upstream
      await vi.advanceTimersByTimeAsync(90000) // tick 2: uses upstream, but this train is now confirmed
      expect(getOperations).toHaveBeenNthCalledWith(2, ['5100', 'upstream'])

      await vi.advanceTimersByTimeAsync(90000) // tick 3: nothing enRoute anymore
      expect(getOperations).toHaveBeenNthCalledWith(3, ['5100'])
    })

    it('clears aux stations when interest TTL-expires to empty, regardless of what it held', async () => {
      const getOperations = vi.fn().mockResolvedValue({
        trains: [makeEnRouteTrain('25', '1', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      })
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(90000)
      expect(getOperations).toHaveBeenNthCalledWith(2, ['5100', 'upstream'])

      // Cisza dłuższa niż interestTtlMs -- poller usypia, '5100' i jego stacja
      // pomocnicza znikają.
      await vi.advanceTimersByTimeAsync(300000)
      expect(poller.isAwake()).toBe(false)

      // Zupełnie inna stacja, niepowiązana z 'upstream' -- nie powinna go odziedziczyć.
      poller.registerInterest(['9999'])
      await vi.advanceTimersByTimeAsync(0)
      expect(getOperations).toHaveBeenLastCalledWith(['9999'])
    })

    it('keeps the aux station count within MAX_AUX_STATIONS even with many concurrent enRoute connections', async () => {
      const stationCount = MAX_AUX_STATIONS + 10
      const stationIds = Array.from({ length: stationCount }, (_, i) => `station-${i}`)
      const trains = stationIds.map((stationId, i) => makeEnRouteTrain(String(i), '1', stationId))
      const routes = stationIds.map((stationId, i) => routeWithUpstream(String(i), '1', `upstream-${i}`, stationId))

      const getOperations = vi.fn().mockResolvedValue({ trains, stationNames: {}, budget: { hourly: 99, daily: 999 } })
      const getSchedules = vi.fn().mockResolvedValue({ routes, carrierNames: {} })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(stationIds)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(90000)

      const secondCallStations = getOperations.mock.calls[1][0] as string[]
      const auxCount = secondCallStations.length - stationCount
      expect(auxCount).toBeLessThanOrEqual(MAX_AUX_STATIONS)
    })
  })

  describe('re-fetch obserwowanych stacji po ucięciu /operations', () => {
    /** Potwierdzony przystanek na `stationId` z zadanym opóźnieniem odjazdu -- do sprawdzenia, z której odpowiedzi liczą się statystyki. */
    function makeConfirmedDelayed(scheduleId: string, orderId: string, stationId: string, delayMinutes: number): RawTrainOperation {
      const t = makeEnRouteTrain(scheduleId, orderId, stationId)
      return {
        ...t,
        stations: [{ ...t.stations[0], isConfirmed: true, actualDeparture: t.stations[0].plannedDeparture, departureDelayMinutes: delayMinutes }],
      }
    }

    it('dociąga same obserwowane stacje, gdy zbiorcze zapytanie (z pomocniczymi) zostało ucięte', async () => {
      const getOperations = vi
        .fn()
        .mockResolvedValueOnce({ trains: [makeEnRouteTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 }, truncated: false })
        .mockResolvedValueOnce({ trains: [makeEnRouteTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 }, truncated: true })
        .mockResolvedValue({ trains: [makeConfirmedDelayed('25', '1', '5100', 10)], stationNames: {}, budget: { hourly: 98, daily: 998 }, truncated: false })
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0) // cykl 1: odkrywa upstream
      await vi.advanceTimersByTimeAsync(90000) // cykl 2: zbiorcze ['5100','upstream'] ucięte -> re-fetch ['5100']

      expect(getOperations).toHaveBeenCalledTimes(3)
      expect(getOperations).toHaveBeenNthCalledWith(2, ['5100', 'upstream'])
      expect(getOperations).toHaveBeenNthCalledWith(3, ['5100'])
      expect(poller.getDiagnostics().operations.truncatedRefetch).toBe(true)
      // Statystyki liczą się z węższego (kompletnego) zapytania, nie z ucięcia:
      // ucięta odpowiedź nie zawierała potwierdzonego przejazdu.
      expect(poller.getSnapshot('5100')?.stats.averageDelayMinutes).toBe(10)
    })

    it('nie dociąga, gdy nie było stacji pomocniczych w zapytaniu (nawet jeśli ucięte)', async () => {
      const getOperations = vi
        .fn()
        .mockResolvedValue({ trains: [makeTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 }, truncated: true })
      const client = makePkpClient({ getOperations })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)

      expect(getOperations).toHaveBeenCalledTimes(1)
      expect(poller.getDiagnostics().operations.truncatedRefetch).toBe(false)
    })

    it.each([
      ['awaryjnie niskim (poniżej progu throttla)', { hourly: 4, daily: 900 }],
      ['kurczącym się (nad progiem throttla, ale bez zapasu na drugie zapytanie)', { hourly: 15, daily: 900 }],
    ])('odpuszcza re-fetch przy budżecie %s -- przełyka niepełne dane', async (_label, budget) => {
      const getOperations = vi
        .fn()
        .mockResolvedValueOnce({ trains: [makeEnRouteTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 }, truncated: false })
        .mockResolvedValue({ trains: [makeEnRouteTrain('25', '1', '5100')], stationNames: {}, budget, truncated: true })
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(90000)

      expect(getOperations).toHaveBeenCalledTimes(2) // zbiorcze cykl 1 + cykl 2, bez re-fetch
      expect(poller.getDiagnostics().operations.truncatedRefetch).toBe(false)
    })

    it('nie wywraca cyklu, gdy samo dociągnięcie padnie -- używa danych z ucięcia', async () => {
      const getOperations = vi
        .fn()
        .mockResolvedValueOnce({ trains: [makeEnRouteTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 }, truncated: false })
        .mockResolvedValueOnce({ trains: [makeEnRouteTrain('25', '1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 }, truncated: true })
        .mockRejectedValue(new Error('re-fetch boom'))
      const getSchedules = vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('25', '1', 'upstream', '5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      })
      const client = makePkpClient({ getOperations, getSchedules })
      const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

      poller.registerInterest(['5100'])
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(90000)

      expect(poller.getStatus()).toBe('ok')
      expect(poller.getSnapshot('5100')).toBeDefined()
    })
  })
})

describe('mergeUpstreamStops', () => {
  function opTrain(scheduleId: string, orderId: string, stationIds: string[], operatingDate: string | null = '2026-08-01'): RawTrainOperation {
    return {
      scheduleId,
      orderId,
      trainOrderId: null,
      operatingDate,
      trainStatus: null,
      stations: stationIds.map((stationId) => ({
        stationId,
        plannedArrival: null,
        actualArrival: null,
        plannedDeparture: null,
        actualDeparture: null,
        arrivalDelayMinutes: null,
        departureDelayMinutes: null,
        isCancelled: false,
        isConfirmed: false,
      })),
    }
  }

  it('dokleja przystanki z górnej trasy do kompletnej listy z węższego zapytania', () => {
    const base = [opTrain('25', '1', ['5100'])]
    const withUpstream = [opTrain('25', '1', ['5100', 'upstream-a', 'upstream-b'])]

    const merged = mergeUpstreamStops(base, withUpstream)

    expect(merged).toHaveLength(1)
    expect(merged[0].stations.map((s) => s.stationId)).toEqual(['5100', 'upstream-a', 'upstream-b'])
  })

  it('o zbiorze pociągów decyduje `base` -- przejazd tylko z zapytania zbiorczego nie wchodzi', () => {
    const base = [opTrain('25', '1', ['5100'])]
    const withUpstream = [opTrain('25', '1', ['5100', 'upstream']), opTrain('99', '2', ['other'])]

    const merged = mergeUpstreamStops(base, withUpstream)

    expect(merged.map((t) => t.scheduleId)).toEqual(['25'])
  })

  it('nie duplikuje przystanku, który jest już w `base`', () => {
    const base = [opTrain('25', '1', ['5100', 'upstream'])]
    const withUpstream = [opTrain('25', '1', ['5100', 'upstream'])]

    const merged = mergeUpstreamStops(base, withUpstream)

    expect(merged[0]).toBe(base[0]) // brak zmian -> ta sama referencja
  })

  it('przepuszcza bez zmian przejazd bez operatingDate (nie da się dopasować)', () => {
    const base = [opTrain('25', '1', ['5100'], null)]
    const withUpstream = [opTrain('25', '1', ['5100', 'upstream'], null)]

    const merged = mergeUpstreamStops(base, withUpstream)

    expect(merged[0].stations.map((s) => s.stationId)).toEqual(['5100'])
  })
})

describe('diagnostyka źródeł', () => {
  const cfg = { pollIntervalMs: 90000, interestTtlMs: 300000 }

  function makeTrainOn(date: string) {
    const t = makeTrain('2026', '1', '5100')
    return { ...t, operatingDate: date }
  }

  it('raportuje stan trzech endpointów osobno po udanym cyklu', async () => {
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [makeTrainOn('2026-08-01')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
      getSchedules: vi.fn().mockResolvedValue({
        routes: [routeWithUpstream('2026', '1', '5136', '5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      }),
      getDisruptions: vi.fn().mockResolvedValue({ disruptions: [], disruptionTypes: {} }),
    })
    const poller = createPoller({ client, config: cfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const d = poller.getDiagnostics()
    expect(d.operations).toMatchObject({ ok: true, records: 1 })
    expect(d.schedules).toMatchObject({ ok: true, records: 1, usedFullRouteFallback: false })
    expect(d.disruptions).toMatchObject({ ok: true, records: 0 })
    expect(d.operations.lastSuccessAt).not.toBeNull()
  })

  it('odróżnia awarię rozkładu od pustego rozkładu -- ta pierwsza degraduje cicho', async () => {
    // Awaria /schedules jest łapana lokalnie i nie zmienia PollerStatus, więc
    // bez tego pola z aplikacji nie dało się odczytać, że rozkładu brakuje.
    const client = makePkpClient({
      getSchedules: vi.fn().mockRejectedValue(new Error('boom')),
    })
    const poller = createPoller({ client, config: cfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getDiagnostics().schedules.ok).toBe(false)
    expect(poller.getDiagnostics().schedules.lastSuccessAt).toBeNull()
    expect(poller.getStatus()).toBe('ok')
  })

  it('nie pyta o wersję danych, gdy feed jest zdrowy', async () => {
    const getDataVersion = vi.fn()
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [makeTrainOn('2026-08-01')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
      getDataVersion,
    })
    const poller = createPoller({ client, config: cfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getDataVersion).not.toHaveBeenCalled()
    expect(poller.getDiagnostics().dataVersion).toBeNull()
  })

  it('pyta o wersję danych, gdy w odpowiedzi nie ma ani jednego dzisiejszego pociągu', async () => {
    // Dokładnie awaria z 27-31.08: /operations zwracało komplet pociągów,
    // ale wyłącznie z dni minionych.
    const getDataVersion = vi.fn().mockResolvedValue({
      dataVersion: 'a',
      schedulesVersion: 'b',
      operationsVersion: 'c',
      timestamp: '2026-07-30T14:08:15.000Z',
    })
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [makeTrainOn('2026-07-25')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
      getDataVersion,
    })
    const poller = createPoller({ client, config: cfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getDataVersion).toHaveBeenCalledTimes(1)
    expect(poller.getDiagnostics().dataVersion).toMatchObject({
      operationsVersion: 'c',
      timestamp: '2026-07-30T14:08:15.000Z',
    })
  })

  it('dławi pytania o wersję danych -- seria zamrożonych cykli to nie seria zapytań', async () => {
    const getDataVersion = vi.fn().mockResolvedValue({
      dataVersion: 'a',
      schedulesVersion: 'b',
      operationsVersion: 'c',
      timestamp: '2026-07-30T14:08:15.000Z',
    })
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [makeTrainOn('2026-07-25')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
      getDataVersion,
    })
    // Dłuższe TTL zainteresowania niż domyślne 5 min: inaczej poller zasnąłby
    // dokładnie w oknie dławika i test mieszałby dwa niezależne mechanizmy.
    const poller = createPoller({
      client,
      config: { pollIntervalMs: 90000, interestTtlMs: 60 * 60 * 1000 },
      stationNames: new Map(),
    })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(90000)
    await vi.advanceTimersByTimeAsync(90000)

    // Trzy cykle, ale odstęp dławika to 5 minut.
    expect(getDataVersion).toHaveBeenCalledTimes(1)

    // Po przekroczeniu okna dławik zwalnia -- nie blokuje na zawsze.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(getDataVersion).toHaveBeenCalledTimes(2)
  })

  it('nie wywraca cyklu, gdy samo sprawdzenie wersji padnie', async () => {
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [makeTrainOn('2026-07-25')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
      getDataVersion: vi.fn().mockRejectedValue(new Error('boom')),
    })
    const poller = createPoller({ client, config: cfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getDiagnostics().dataVersion).toBeNull()
    expect(poller.getDiagnostics().operations.ok).toBe(true)
  })
})
