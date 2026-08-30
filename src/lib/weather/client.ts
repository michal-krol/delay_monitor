import { z } from 'zod'

const BASE_URL = 'https://api.open-meteo.com/v1/forecast'
/** Ta sama wartość co `REQUEST_TIMEOUT_MS` w `pkp/client.ts` -- brak powodu, żeby się różniły. */
const REQUEST_TIMEOUT_MS = 8000

export type OpenMeteoSnapshot = {
  current: {
    temperatureC: number
    apparentTemperatureC: number
    weatherCode: number
    windSpeedKmh: number
    windDirectionDeg: number
    humidityPercent: number
    pressureHpa: number
  }
  today: {
    minTemperatureC: number
    maxTemperatureC: number
    precipitationMm: number
    precipitationProbabilityPercent: number
    /** ISO, już czas warszawski -- `timezone=Europe/Warsaw` w zapytaniu. */
    sunrise: string
    sunset: string
  }
}

export class WeatherApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'WeatherApiError'
    this.status = status
  }
}

const openMeteoResponseSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    wind_direction_10m: z.number(),
    relative_humidity_2m: z.number(),
    surface_pressure: z.number(),
  }),
  daily: z.object({
    temperature_2m_max: z.array(z.number()).min(1),
    temperature_2m_min: z.array(z.number()).min(1),
    precipitation_sum: z.array(z.number()).min(1),
    precipitation_probability_max: z.array(z.number()).min(1),
    sunrise: z.array(z.string()).min(1),
    sunset: z.array(z.string()).min(1),
  }),
})

/**
 * Bez uwierzytelnienia (Open-Meteo jest darmowe i bezkluczowe) i bez
 * cache'owania -- cache i deduplikacja zapytań równoległych żyją o warstwę
 * wyżej, w `route.ts`, tak jak `pkp/client.ts` też sam siebie nie cache'uje.
 */
export async function fetchOpenMeteoWeather(lat: number, lon: number): Promise<OpenMeteoSnapshot> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset',
    timezone: 'Europe/Warsaw',
    forecast_days: '1',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${BASE_URL}?${params}`, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new WeatherApiError(`Open-Meteo: ${response.status}`, response.status)
  }

  const json: unknown = await response.json()
  const parsed = openMeteoResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new WeatherApiError('Nieoczekiwany kształt odpowiedzi Open-Meteo', 502)
  }

  const { current, daily } = parsed.data
  return {
    current: {
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      weatherCode: current.weather_code,
      windSpeedKmh: current.wind_speed_10m,
      windDirectionDeg: current.wind_direction_10m,
      humidityPercent: current.relative_humidity_2m,
      pressureHpa: current.surface_pressure,
    },
    today: {
      minTemperatureC: daily.temperature_2m_min[0],
      maxTemperatureC: daily.temperature_2m_max[0],
      precipitationMm: daily.precipitation_sum[0],
      precipitationProbabilityPercent: daily.precipitation_probability_max[0],
      sunrise: daily.sunrise[0],
      sunset: daily.sunset[0],
    },
  }
}
