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
  // Świadomie BEZ `PORT`: serwer czyta `process.env.PORT` sam (Next w trybie
  // standalone, patrz Dockerfile), więc parsowanie go tutaj tworzyło pole,
  // które nikt nigdy nie odczytał -- i sugerowało, że to my o porcie decydujemy.
})

export type DataSource = 'live' | 'mock'

/** Patrz `BOARD_SOURCE` w schemacie wyżej. */
export type BoardSource = 'schedule' | 'operations'

export type AppConfig = {
  apiKey: string | undefined
  dataSource: DataSource
  pollIntervalMs: number
  interestTtlMs: number
  boardSource: BoardSource
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  if (parsed.PKP_DATA_SOURCE === 'live' && !parsed.PKP_API_KEY) {
    throw new Error('PKP_DATA_SOURCE=live wymaga ustawienia PKP_API_KEY')
  }

  const dataSource: DataSource =
    parsed.PKP_DATA_SOURCE === 'auto' ? (parsed.PKP_API_KEY ? 'live' : 'mock') : parsed.PKP_DATA_SOURCE

  return {
    apiKey: parsed.PKP_API_KEY,
    dataSource,
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
    interestTtlMs: parsed.INTEREST_TTL_MS,
    boardSource: parsed.BOARD_SOURCE,
  }
}
