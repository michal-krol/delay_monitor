import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller } from './poller'
import type { PkpClient } from '../pkp/client'
import type { RawRoute, RawTrainOperation } from '../pkp/types'
import { makePkpClient } from '@/test-utils/pkpClient'

/**
 * Awarie, w których PKP odpowiada HTTP 200, ale treścią bezużyteczną — czyli
 * takie, których `status: 'degraded'` (wymagający rzuconego wyjątku) nie widzi
 * i których nie łapie żaden z pozostałych testów pollera.
 *
 * Wszystkie kształty tutaj pochodzą z ODPOWIEDZI ZEBRANYCH NA ŻYWO 2026-08-30,
 * nie z wyobraźni:
 *
 *  - `/operations?stations=33605&withPlanned=true` zwróciło 1481 pociągów,
 *    z czego DOKŁADNIE ZERO przystanków niosło `plannedArrival` albo
 *    `plannedDeparture` (parametr `withPlanned=true` przestał działać —
 *    odpowiedź była bajt w bajt identyczna z `withPlanned=false`).
 *  - `/schedules?...&fullRoute=true` zwróciło 10 498 tras, z czego ZERO
 *    miało niepustą listę `stations`.
 *
 * Efekt w aplikacji przed tą poprawką: `transformOperations` odrzucało każdy
 * wiersz (bramka na `plannedDeparture`/`plannedArrival`), poller raportował
 * `ok`, a puste snapshoty NADPISYWAŁY ostatnie dobre dane — czyli ochrona
 * z AGENTS.md #7 działała dokładnie odwrotnie, niż zakłada.
 */

/**
 * Przystanek dokładnie taki, jak w zamrożonej odpowiedzi: czas faktyczny jest,
 * planowego nie ma wcale. `operatingDate` zrównane z zamrożonym zegarem testu,
 * bo to z niego `resolvePlannedTime()` składa plan, gdy trasa go dostarcza.
 */
function frozenTrain(orderId: string, stationId: string): RawTrainOperation {
  return {
    scheduleId: '2026',
    orderId,
    trainOrderId: null,
    operatingDate: '2026-08-01',
    trainStatus: 'S',
    stations: [
      {
        stationId,
        plannedArrival: null,
        plannedDeparture: null,
        actualArrival: '2026-08-01T12:52:00.000Z',
        actualDeparture: '2026-08-01T12:54:00.000Z',
        arrivalDelayMinutes: null,
        departureDelayMinutes: null,
        isCancelled: false,
        isConfirmed: false,
      },
    ],
  }
}

/** Zdrowy pociąg: ma planowy odjazd w oknie widoczności tablicy. */
function healthyTrain(orderId: string, stationId: string, minutesFromNow = 5): RawTrainOperation {
  return {
    scheduleId: '2026',
    orderId,
    trainOrderId: null,
    operatingDate: '2026-08-01',
    trainStatus: null,
    stations: [
      {
        stationId,
        plannedArrival: null,
        plannedDeparture: new Date(Date.now() + minutesFromNow * 60000).toISOString(),
        actualArrival: null,
        actualDeparture: null,
        arrivalDelayMinutes: null,
        departureDelayMinutes: null,
        isCancelled: false,
        isConfirmed: false,
      },
    ],
  }
}

/**
 * Pociąg ze zdrowego feedu, ale zaplanowany poza oknem tablicy (1 h w przód /
 * 5 min wstecz). Kluczowy przypadek kontrolny: tablica jest pusta i to jest
 * POPRAWNE — nie wolno tego pomylić z awarią.
 */
function outOfWindowTrain(orderId: string, stationId: string): RawTrainOperation {
  return healthyTrain(orderId, stationId, 8 * 60)
}

/**
 * Trasa rozkładowa z planowymi godzinami — to, co `/schedules` podaje nadal,
 * gdy realizacja jest już martwa. `12:05:00` przy `operatingDate` 2026-08-01
 * i zamrożonym zegarze testu na 12:00 czasu warszawskiego wypada w oknie
 * widoczności tablicy.
 */
function routeWithTimes(scheduleId: string, orderId: string, stationId: string): RawRoute {
  const stop = (id: string, departureTime: string | null, arrivalTime: string | null) => ({
    stationId: id,
    arrivalPlatform: null,
    arrivalTrack: null,
    departurePlatform: '4',
    departureTrack: null,
    arrivalTime,
    departureTime,
    arrivalDay: null,
    departureDay: null,
    stopTypeName: null,
  })
  return {
    scheduleId,
    orderId,
    trainOrderId: null,
    carrierCode: 'KM',
    commercialCategorySymbol: 'REG',
    name: null,
    nationalNumber: '91342',
    operatingDates: ['2026-08-01'],
    stations: [stop(stationId, '12:05:00', null), stop('9999', null, '13:00:00')],
  }
}

function makePoller(client: PkpClient) {
  return createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-01T12:00:00+02:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('zamrożony feed PKP (200 z bezużyteczną treścią)', () => {
  it('zgłasza degraded, gdy pociągi przyszły, ale żaden nie niesie planowego czasu', async () => {
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [frozenTrain('1', '5100'), frozenTrain('2', '5100'), frozenTrain('3', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
    })
    const poller = makePoller(client)

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getStatus()).toBe('degraded')
  })

  it('NIE nadpisuje ostatniego dobrego snapshotu pustym, gdy feed zamarza', async () => {
    const getOperations = vi
      .fn()
      // Pierwszy cykl: zdrowe dane.
      .mockResolvedValueOnce({
        trains: [healthyTrain('1', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      })
      // Drugi cykl: feed zamarł.
      .mockResolvedValue({
        trains: [frozenTrain('2', '5100'), frozenTrain('3', '5100')],
        stationNames: {},
        budget: { hourly: 98, daily: 998 },
      })
    const poller = makePoller(makePkpClient({ getOperations }))

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getSnapshot('5100')?.departures).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(90000)

    expect(getOperations).toHaveBeenCalledTimes(2)
    // Stary, dobry rozkład ma zostać. AGENTS.md #7: przy awarii pokazujemy
    // ostatni znany dobry snapshot wraz z jego wiekiem, nie czyścimy widoku.
    expect(poller.getSnapshot('5100')?.departures).toHaveLength(1)
    expect(poller.getStatus()).toBe('degraded')
  })

  it('nie krzyczy, gdy feed jest zdrowy, a pociągi są po prostu poza oknem tablicy', async () => {
    // Kontrola przeciw fałszywemu alarmowi: w nocy tablica bywa pusta i to
    // jest prawda o rozkładzie, nie awaria. Różnica wobec zamrożonego feedu
    // jest jednoznaczna — tu planowe czasy SĄ, tylko leżą dalej niż okno.
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [outOfWindowTrain('1', '5100'), outOfWindowTrain('2', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
    })
    const poller = makePoller(client)

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getStatus()).toBe('ok')
    expect(poller.getSnapshot('5100')?.departures).toHaveLength(0)
  })

  it('nie krzyczy, gdy PKP nie zwróciło żadnego pociągu', async () => {
    // Pusta odpowiedź to co innego niż odpowiedź pełna bezużytecznych wierszy:
    // nie ma z czego wnioskować, że feed jest zepsuty, więc nie zgadujemy.
    const poller = makePoller(makePkpClient())

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getStatus()).toBe('ok')
  })

  it('buduje tablicę z samego rozkładu, gdy realizacja jest martwa, a /schedules żyje', async () => {
    // Sedno poprawki: 2026-08-30 rozkład był dostępny przez cały czas trwania
    // awarii realizacji, a tablica i tak świeciła pustką — bo bramkowała wiersz
    // na planowym czasie z `/operations`, zamiast złożyć go z trasy, którą
    // trzymała w ręku. Panel szczegołów połączenia robił to poprawnie od zawsze.
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [frozenTrain('1', '5100')],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
      getSchedules: vi.fn().mockResolvedValue({
        routes: [routeWithTimes('2026', '1', '5100')],
        carrierNames: { KM: 'Koleje Mazowieckie' },
        categoryNames: {},
        stationNames: { '5100': 'Warszawa Centralna', '9999': 'Skierniewice' },
      }),
    })
    const poller = makePoller(client)

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const snapshot = poller.getSnapshot('5100')
    expect(snapshot?.departures).toHaveLength(1)
    expect(snapshot?.departures[0].plannedAt).toBe('2026-08-01T10:05:00.000Z')
    // Peron też pochodzi z rozkładu, nie z realizacji.
    expect(snapshot?.departures[0].platform).toBe('4')
    // Realizacji nadal nie ma, więc opóźnienie musi zostać nieznane — nigdy 0.
    expect(snapshot?.departures[0].delayMinutes).toBeNull()
    // ...i UI ma o tym wiedzieć: plan bez realizacji to dane niepełne.
    expect(poller.getStatus()).toBe('degraded')
  })

  it('wraca do ok, gdy feed się odwiesza', async () => {
    const getOperations = vi
      .fn()
      .mockResolvedValueOnce({ trains: [frozenTrain('1', '5100')], stationNames: {}, budget: { hourly: 99, daily: 999 } })
      .mockResolvedValue({ trains: [healthyTrain('2', '5100')], stationNames: {}, budget: { hourly: 98, daily: 998 } })
    const poller = makePoller(makePkpClient({ getOperations }))

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getStatus()).toBe('degraded')

    await vi.advanceTimersByTimeAsync(90000)

    expect(poller.getStatus()).toBe('ok')
    expect(poller.getSnapshot('5100')?.departures).toHaveLength(1)
  })
})

describe('rozkład jako źródło listy', () => {
  const scheduleCfg = { pollIntervalMs: 90000, interestTtlMs: 300000, boardSource: 'schedule' as const }

  function todayRoute(stationId: string) {
    return { ...routeWithTimes('2026', '1', stationId), operatingDates: ['2026-08-01'] }
  }

  it('buduje tablicę, gdy realizacja nie zna dzisiejszych pociągów', async () => {
    // Awaria 27-31.08: /operations zwracało wyłącznie kursy sprzed kilku dni.
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } }),
      getSchedules: vi.fn().mockResolvedValue({
        routes: [todayRoute('5100')],
        carrierNames: { KM: 'Koleje Mazowieckie' },
        categoryNames: {},
        stationNames: { '5100': 'Warszawa Centralna', '9999': 'Skierniewice' },
        usedFullRouteFallback: false,
      }),
    })
    const poller = createPoller({ client, config: scheduleCfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const snapshot = poller.getSnapshot('5100')
    expect(snapshot?.departures).toHaveLength(1)
    expect(snapshot?.departures[0].delayMinutes).toBeNull()
    expect(snapshot?.departures[0].platform).toBe('4')
    // Wiersze są, ale ani jednego opóźnienia nie znamy -- UI musi to powiedzieć
    // wprost, zamiast pokazywać sam rozkład jako pełnowartościową prawdę.
    expect(poller.getStatus()).toBe('degraded')
  })

  it('nie krzyczy, gdy realizacja zna dzisiejszy ruch', async () => {
    // Kontrola przeciw fałszywemu alarmowi: rozkład jest źródłem listy, ale
    // realizacja działa, więc dane są kompletne.
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({
        trains: [
          {
            ...healthyTrain('1', '5100'),
            trainOrderId: '1',
            operatingDate: '2026-08-01',
          },
        ],
        stationNames: {},
        budget: { hourly: 99, daily: 999 },
      }),
      getSchedules: vi.fn().mockResolvedValue({
        routes: [todayRoute('5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      }),
    })
    const poller = createPoller({ client, config: scheduleCfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getStatus()).toBe('ok')
  })

  it('trzyma ostatni znany rozkład, gdy /schedules przestaje odpowiadać', async () => {
    // Cache klienta ma TTL 24 h i wygasa dokładnie w dłuższej awarii, kiedy jest
    // najbardziej potrzebny -- dlatego poller trzyma własny uchwyt bez TTL.
    const getSchedules = vi
      .fn()
      .mockResolvedValueOnce({
        routes: [todayRoute('5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      })
      .mockRejectedValue(new Error('schedules down'))
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } }),
      getSchedules,
    })
    const poller = createPoller({ client, config: scheduleCfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.getSnapshot('5100')?.departures).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(90000)

    expect(getSchedules).toHaveBeenCalledTimes(2)
    // Tablica nadal stoi, a diagnostyka mówi wprost, że rozkład jest nieświeży.
    expect(poller.getSnapshot('5100')?.departures).toHaveLength(1)
    expect(poller.getDiagnostics().schedules.ok).toBe(false)
  })

  it('pusta odpowiedź rozkładu nie kasuje ostatniego dobrego', async () => {
    const getSchedules = vi
      .fn()
      .mockResolvedValueOnce({
        routes: [todayRoute('5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      })
      .mockResolvedValue({
        routes: [],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      })
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } }),
      getSchedules,
    })
    const poller = createPoller({ client, config: scheduleCfg, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(90000)

    expect(poller.getSnapshot('5100')?.departures).toHaveLength(1)
  })

  it('ścieżka historyczna zostaje, gdy flaga wskazuje operations', async () => {
    const client = makePkpClient({
      getOperations: vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } }),
      getSchedules: vi.fn().mockResolvedValue({
        routes: [todayRoute('5100')],
        carrierNames: {},
        categoryNames: {},
        stationNames: {},
        usedFullRouteFallback: false,
      }),
    })
    const poller = createPoller({
      client,
      config: { pollIntervalMs: 90000, interestTtlMs: 300000, boardSource: 'operations' },
      stationNames: new Map(),
    })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    // Bez realizacji stara ścieżka nie ma z czego zbudować wiersza.
    expect(poller.getSnapshot('5100')?.departures).toHaveLength(0)
  })
})
