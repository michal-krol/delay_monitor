import { z } from 'zod'

const envSchema = z.object({
  PKP_API_KEY: z.string().optional(),
  PKP_DATA_SOURCE: z.enum(['auto', 'live', 'mock']).default('auto'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(90000),
  INTEREST_TTL_MS: z.coerce.number().int().positive().default(300000),
  /**
   * Co wyznacza LISTĘ połączeń na tablicy. `schedule` (domyślnie) bierze ją
   * z rozkładu i nakłada realizację jako warstwę; `operations` to zachowanie
   * historyczne, w którym lista pochodzi z realizacji.
   *
   * Przełącznik istnieje, żeby powrót do starej ścieżki był zmianą zmiennej
   * w Railway i restartem, a nie wdrożeniem kodu. Do usunięcia po okresie
   * obserwacji.
   */
  BOARD_SOURCE: z.enum(['schedule', 'operations']).default('schedule'),

  /**
   * Podprojekt komunikacji miejskiej (GTFS). `GTFS_ENABLED` to wyłącznik:
   * jeśli ładowanie zacznie sprawiać kłopot na produkcji, wyłączasz podprojekt
   * zmienną, a monitor PKP działa nietknięty (precedens: `BOARD_SOURCE`).
   *
   * `z.stringbool`, nie `z.coerce.boolean` — to drugie traktuje każdy niepusty
   * string jako `true`, więc `GTFS_ENABLED=false` by go WŁĄCZYŁO.
   */
  GTFS_ENABLED: z.stringbool().default(true),
  /** Lista miast do włączenia, po przecinku. Pozwala wyłączyć jedno bez wdrożenia. */
  GTFS_CITIES: z.string().default('waw'),
  /**
   * Nie `auto` — `auto` w schemacie PKP wnioskuje z obecności klucza, a GTFS
   * klucza nie ma. Domyślnie `mock`: `live` znaczy ~107 MB pobrania, więc
   * `npm run dev`, `npm run test` i CI są zerowo-sieciowe bez dodatkowej obsługi.
   */
  GTFS_DATA_SOURCE: z.enum(['live', 'mock']).default('mock'),
  GTFS_IDLE_TTL_MS: z.coerce.number().int().positive().default(3600000),
  // Świadomie BEZ `PORT`: serwer czyta `process.env.PORT` sam (Next w trybie
  // standalone, patrz Dockerfile), więc parsowanie go tutaj tworzyło pole,
  // które nikt nigdy nie odczytał -- i sugerowało, że to my o porcie decydujemy.
})

export type DataSource = 'live' | 'mock'

/** Patrz `BOARD_SOURCE` w schemacie wyżej. */
export type BoardSource = 'schedule' | 'operations'

export type GtfsConfig = {
  enabled: boolean
  cities: string[]
  dataSource: DataSource
  idleTtlMs: number
}

export type AppConfig = {
  apiKey: string | undefined
  dataSource: DataSource
  pollIntervalMs: number
  interestTtlMs: number
  boardSource: BoardSource
  gtfs: GtfsConfig
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  if (parsed.PKP_DATA_SOURCE === 'live' && !parsed.PKP_API_KEY) {
    throw new Error('PKP_DATA_SOURCE=live wymaga ustawienia PKP_API_KEY')
  }

  const dataSource: DataSource =
    parsed.PKP_DATA_SOURCE === 'auto' ? (parsed.PKP_API_KEY ? 'live' : 'mock') : parsed.PKP_DATA_SOURCE

  const gtfsCities = parsed.GTFS_CITIES.split(',')
    .map((city) => city.trim())
    .filter((city) => city.length > 0)

  return {
    apiKey: parsed.PKP_API_KEY,
    dataSource,
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
    interestTtlMs: parsed.INTEREST_TTL_MS,
    boardSource: parsed.BOARD_SOURCE,
    gtfs: {
      enabled: parsed.GTFS_ENABLED,
      cities: gtfsCities,
      dataSource: parsed.GTFS_DATA_SOURCE,
      idleTtlMs: parsed.GTFS_IDLE_TTL_MS,
    },
  }
}
