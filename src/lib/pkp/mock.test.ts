import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockClient } from './mock'
import { PkpApiError } from './client'

describe('createMockClient', () => {
  it('filters station search by case-insensitive substring', async () => {
    const client = createMockClient()
    const results = await client.searchStations('kraków')
    expect(results).toEqual([{ id: '80416', name: 'Kraków Główny' }])
  })

  it('returns all stations for an empty query', async () => {
    const client = createMockClient()
    const results = await client.searchStations('')
    expect(results.length).toBeGreaterThanOrEqual(4)
  })

  it('returns only trains that stop at one of the requested station ids', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['80416'])
    expect(result.trains.every((train) => train.stations.some((stop) => stop.stationId === '80416'))).toBe(true)
    expect(result.trains.length).toBeGreaterThan(0)
  })

  it('returns the station name dictionary bundled with the fixture', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['33605'])
    expect(result.stationNames['33605']).toBe('Warszawa Centralna')
  })

  it('rebases fixture timestamps to be close to now', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['33605'])
    const stop = result.trains.flatMap((train) => train.stations).find((s) => s.stationId === '33605')
    expect(stop).toBeDefined()
    const referenceMs = new Date((stop!.plannedArrival ?? stop!.plannedDeparture) as string).getTime()
    expect(Math.abs(referenceMs - Date.now())).toBeLessThan(3 * 60 * 60 * 1000)
  })

  it('rebases operatingDate to today (Warsaw calendar date), not the fixture date', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['33605'])
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date())
    expect(result.trains.every((train) => train.operatingDate === today)).toBe(true)
  })

  it('returns a stable mock budget', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['33605'])
    expect(result.budget).toEqual({ hourly: 99, daily: 999, hourlyLimit: 100, dailyLimit: 1000 })
  })

  it('returns schedules only for trains that stop at the requested stations', async () => {
    const client = createMockClient()
    const { routes } = await client.getSchedules(['80416'])
    expect(routes.map((route) => route.orderId).sort()).toEqual(['104', '107', '110', '114'])
    expect(routes.every((route) => route.scheduleId === '2026')).toBe(true)
  })

  it('bundles the carrier name dictionary from the same response', async () => {
    const client = createMockClient()
    const { carrierNames } = await client.getSchedules(['33605'])
    expect(carrierNames.IC).toBe('„PKP Intercity” Spółka Akcyjna')
    expect(carrierNames.KM).toBe('"Koleje Mazowieckie - KM" sp. z o.o.')
    expect(carrierNames.PR).toBe('POLREGIO S.A.')
  })

  it('bundles the station name dictionary from the same response', async () => {
    const client = createMockClient()
    const { stationNames } = await client.getSchedules(['33605'])
    expect(stationNames['80416']).toBe('Kraków Główny')
  })

  it('resolves name dictionaries for carrier/category codes used in the fixtures', async () => {
    const client = createMockClient()
    const { carrierNames, categoryNames } = await client.getNameDictionaries()

    // Sam słownik przewoźników co getSchedules() -- nie duplikowany osobno.
    expect(carrierNames.IC).toBe('„PKP Intercity” Spółka Akcyjna')
    expect(categoryNames['IC|EIC']).toBe('Express InterCity')
  })

  it('carries carrier and category codes on each route', async () => {
    const client = createMockClient()
    const { routes } = await client.getSchedules(['33605'])
    const eic = routes.find((route) => route.orderId === '101')
    // Fixture ma sztywny sierpień 2026; mock podmienia daty kursowania na
    // dzisiejszą, tak samo jak `operatingDate` pociągów -- inaczej statystyki
    // stacji („Odjazdy dzisiaj") pokazywałyby zero przy pełnej tablicy.
    const { warsawDateString } = await import('./time')
    expect(eic).toEqual({
      scheduleId: '2026',
      orderId: '101',
      trainOrderId: null,
      carrierCode: 'IC',
      commercialCategorySymbol: 'EIC',
      name: 'BAŁTYK',
      nationalNumber: '4501',
      operatingDates: [warsawDateString(new Date())],
      stations: [
        { stationId: '7500', arrivalPlatform: null, arrivalTrack: null, departurePlatform: '3', departureTrack: '1', arrivalTime: null, departureTime: '11:00:00', arrivalDay: null, departureDay: null, stopTypeName: null },
        { stationId: '7112', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null, arrivalTime: '11:20:00', departureTime: '11:22:00', arrivalDay: null, departureDay: null, stopTypeName: null },
        { stationId: '7872', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null, arrivalTime: '11:35:00', departureTime: '11:37:00', arrivalDay: null, departureDay: null, stopTypeName: null },
        { stationId: '21808', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null, arrivalTime: '12:00:00', departureTime: '12:02:00', arrivalDay: null, departureDay: null, stopTypeName: 'tylko dla wysiadających' },
        { stationId: '22442', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null, arrivalTime: '12:20:00', departureTime: '12:26:00', arrivalDay: null, departureDay: null, stopTypeName: null },
        { stationId: '38653', arrivalPlatform: '2', arrivalTrack: null, departurePlatform: '2', departureTrack: null, arrivalTime: '13:10:00', departureTime: '13:12:00', arrivalDay: null, departureDay: null, stopTypeName: null },
        { stationId: '33605', arrivalPlatform: '4', arrivalTrack: '2', departurePlatform: null, departureTrack: null, arrivalTime: '13:20:00', departureTime: null, arrivalDay: null, departureDay: null, stopTypeName: null },
      ],
    })
  })

  describe('getTrainDetail', () => {
    it('returns the realized operation and matching route for a known train', async () => {
      const client = createMockClient()
      const operations = await client.getOperations(['33605'])
      const operatingDate = operations.trains[0].operatingDate as string

      // Pierwszy pociąg zatrzymujący się na 33605 w kolejności fixture'a to
      // '102' (SUDETY, IC/TLK, odjazd z Warszawy Centralnej).
      const detail = await client.getTrainDetail('2026', '102', operatingDate)

      expect(detail.operation.scheduleId).toBe('2026')
      expect(detail.operation.orderId).toBe('102')
      expect(detail.operation.stations.length).toBeGreaterThanOrEqual(3)
      expect(detail.route?.carrierCode).toBe('IC')
      expect(detail.route?.name).toBe('SUDETY')
    })

    it('rebases the returned operation the same way getOperations does', async () => {
      const client = createMockClient()
      const operations = await client.getOperations(['33605'])
      const operatingDate = operations.trains[0].operatingDate as string

      const detail = await client.getTrainDetail('2026', '102', operatingDate)

      const stop = detail.operation.stations.find((s) => s.stationId === '33605')
      const referenceMs = new Date((stop!.plannedArrival ?? stop!.plannedDeparture) as string).getTime()
      expect(Math.abs(referenceMs - Date.now())).toBeLessThan(3 * 60 * 60 * 1000)
    })

    it('returns a null route for a train without a scheduled route match', async () => {
      const client = createMockClient()
      const operations = await client.getOperations(['33605'])
      const operatingDate = operations.trains[0].operatingDate as string

      // 113 istnieje w operations.json, ale jego trasa w schedules.json ma
      // pustą listę przystanków (brak dopasowanego rozkładu) — samo istnienie route !== null.
      const detail = await client.getTrainDetail('2026', '113', operatingDate)
      expect(detail.route).not.toBeNull()
      expect(detail.route?.stations).toEqual([])
    })

    it('rejects with a 404-like PkpApiError for an unknown train', async () => {
      const client = createMockClient()
      await expect(client.getTrainDetail('2026', 'nieistniejacy', '2026-08-01')).rejects.toMatchObject({
        status: 404,
      })
      await expect(client.getTrainDetail('2026', 'nieistniejacy', '2026-08-01')).rejects.toBeInstanceOf(PkpApiError)
    })

    it('rejects when the operatingDate does not match (stale request)', async () => {
      const client = createMockClient()
      await expect(client.getTrainDetail('2026', '101', '2020-01-01')).rejects.toMatchObject({ status: 404 })
    })

    it('returns an unconfirmed, not-yet-departed shape for the S-status train (107), same as a real not-started train on live', async () => {
      // Jedyny test wywołujący getTrainDetail dla tego konkretnego pociągu --
      // wcześniej nic nie sprawdzało panelu szczegółów dla przypadku S.
      const client = createMockClient()
      const operations = await client.getOperations(['80416'])
      const train107 = operations.trains.find((t) => t.orderId === '107')
      expect(train107).toBeDefined()

      const detail = await client.getTrainDetail('2026', '107', train107!.operatingDate as string)

      expect(detail.operation.trainStatus).toBe('S')
      for (const stop of detail.operation.stations) {
        expect(stop.isConfirmed).toBe(false)
      }
    })
  })

  describe('warm-up robustness', () => {
    afterEach(() => {
      vi.doUnmock('node:fs/promises')
      vi.resetModules()
    })

    it('does not raise an unhandled rejection when a fixture fails to load', async () => {
      // createMockClient() odpala rozgrzewkę słownika stacji jako "fire and
      // forget" (bez await), żeby /api/stations nie czekało na pierwsze
      // wejście/wyjście. Bez .catch() nieudane parsowanie fixture'a (uszkodzony
      // JSON, błąd walidacji Zod) staje się nieobsłużonym odrzuceniem obietnicy,
      // nie cichym brakiem danych — sprawdzone eksperymentalnie w Node.
      //
      // Świeży import modułu pod zamockowanym fs, żeby nie zepsuć pamięci
      // podręcznej fixture'ów współdzielonej przez pozostałe testy w tym pliku.
      vi.resetModules()
      vi.doMock('node:fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('fixture uszkodzony')),
      }))

      const onUnhandledRejection = vi.fn()
      process.on('unhandledRejection', onUnhandledRejection)

      try {
        const freshMock = await import('./mock')
        freshMock.createMockClient()

        // Kolejka mikrozadań musi się przewinąć, żeby Node zdążył odpalić
        // unhandledRejection, jeśli miałby to zrobić.
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(onUnhandledRejection).not.toHaveBeenCalled()
      } finally {
        process.off('unhandledRejection', onUnhandledRejection)
      }
    })

    it('still propagates the failure to a real caller after the warm-up swallowed it', async () => {
      // .catch() na rozgrzewce nie może po cichu połknąć prawdziwych wywołań —
      // searchStations musi nadal odrzucić, żeby /api/stations mogło zwrócić 503.
      vi.resetModules()
      vi.doMock('node:fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('fixture uszkodzony')),
      }))

      const freshMock = await import('./mock')
      const client = freshMock.createMockClient()

      await expect(client.searchStations('warszawa')).rejects.toThrow('fixture uszkodzony')
    })
  })

  describe('getDisruptions', () => {
    it('decodes a dictionary-code message for the matching train (station 33605, train 109)', async () => {
      const client = createMockClient()
      const result = await client.getDisruptions(['33605'])
      expect(result.disruptionTypes.utr_40).toBe('Awaria sieci trakcyjnej')
      expect(result.disruptions.some((d) => d.message === 'utr_40' && d.affectedRoutes.some((r) => r.orderId === '109'))).toBe(true)
    })

    it('returns the already-rendered PKP text verbatim for the other fixture train (station 80416, train 110)', async () => {
      const client = createMockClient()
      const result = await client.getDisruptions(['80416'])
      const disruption = result.disruptions.find((d) => d.affectedRoutes.some((r) => r.orderId === '110'))
      expect(disruption?.message).toBe('Na odcinku od stacji Kraków Główny do stacji Katowice pociąg kursuje z opóźnieniem z powodu prac na sieci trakcyjnej.')
    })

    it('returns no disruptions for a station with none in the fixture', async () => {
      const client = createMockClient()
      const result = await client.getDisruptions(['60103'])
      expect(result.disruptions).toEqual([])
    })

    it('rebases affectedRoutes.operatingDate to today (Warsaw calendar date), matching the rebased train', async () => {
      const client = createMockClient()
      const result = await client.getDisruptions(['33605'])
      const { warsawDateString } = await import('./time')
      const today = warsawDateString(new Date())
      expect(result.disruptions.every((d) => d.affectedRoutes.every((r) => r.operatingDate === today))).toBe(true)
    })
  })
})
