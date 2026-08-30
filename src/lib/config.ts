import { z } from 'zod'

const envSchema = z.object({
  PKP_API_KEY: z.string().optional(),
  PKP_DATA_SOURCE: z.enum(['auto', 'live', 'mock']).default('auto'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(90000),
  INTEREST_TTL_MS: z.coerce.number().int().positive().default(300000),
  // Świadomie BEZ `PORT`: serwer czyta `process.env.PORT` sam (Next w trybie
  // standalone, patrz Dockerfile), więc parsowanie go tutaj tworzyło pole,
  // które nikt nigdy nie odczytał -- i sugerowało, że to my o porcie decydujemy.
})

export type DataSource = 'live' | 'mock'

export type AppConfig = {
  apiKey: string | undefined
  dataSource: DataSource
  pollIntervalMs: number
  interestTtlMs: number
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
  }
}
