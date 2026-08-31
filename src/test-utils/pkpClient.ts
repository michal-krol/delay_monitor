import { vi } from 'vitest'
import type { PkpClient } from '@/lib/pkp/client'

/**
 * Atrapa `PkpClient` z bezpiecznymi wartościami domyślnymi dla każdej metody.
 *
 * Istniała wcześniej w trzech kopiach (`poller.test.ts`, `resilience.test.ts`,
 * `networkStats.test.ts`), które zdążyły się rozjechać: wersja z `poller`
 * zwracała z `getSchedules` niepełny kształt (`{ routes, carrierNames }` bez
 * `categoryNames`/`stationNames`) i przechodziła tylko dlatego, że
 * destrukturyzacja w pollerze toleruje `undefined`. Dopisanie metody do
 * interfejsu wymagało poprawki w trzech miejscach naraz — ten sam powód, dla
 * którego wydzielono `jsonResponse()` do `http.ts`.
 *
 * Domyślne odpowiedzi są celowo PUSTE, nie realistyczne: test, który czegoś
 * potrzebuje, ma to podać jawnie przez `overrides`, żeby z samego testu było
 * widać, na jakich danych działa.
 */
export function makePkpClient(overrides: Partial<PkpClient> = {}): PkpClient {
  return {
    searchStations: vi.fn().mockResolvedValue([]),
    getOperations: vi.fn().mockResolvedValue({
      trains: [],
      stationNames: {},
      budget: { hourly: 99, daily: 999, hourlyLimit: 100, dailyLimit: 1000 },
    }),
    getSchedules: vi.fn().mockResolvedValue({
      routes: [],
      carrierNames: {},
      categoryNames: {},
      stationNames: {},
      usedFullRouteFallback: false,
    }),
    getTrainDetail: vi.fn(),
    getNameDictionaries: vi.fn().mockResolvedValue({ carrierNames: {}, categoryNames: {} }),
    getCachedStationIds: vi.fn(() => null),
    getOperationsStatistics: vi.fn(),
    getDailyCarrierCounts: vi.fn(),
    getDisruptionCount: vi.fn(),
    getDisruptions: vi.fn().mockResolvedValue({ disruptions: [], disruptionTypes: {} }),
    getDataVersion: vi.fn().mockResolvedValue({
      dataVersion: 'v1',
      schedulesVersion: 'v1',
      operationsVersion: 'v1',
      timestamp: '2026-08-01T12:00:00.000Z',
    }),
    ...overrides,
  }
}
