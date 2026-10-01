import type { OpenMeteoSnapshot } from './client'

/**
 * Stała pogoda dla `WEATHER_DATA_SOURCE=mock` (e2e, zero ruchu do Open-Meteo).
 * Nie jest edge clientem — nic nie wychodzi z procesu. Wartości tylko do UI,
 * nie do wnioskowania o pogodzie.
 */
export function mockOpenMeteoWeather(): OpenMeteoSnapshot {
  return {
    current: {
      temperatureC: 18.4,
      apparentTemperatureC: 17.6,
      weatherCode: 2,
      windSpeedKmh: 12.2,
      windDirectionDeg: 250,
      humidityPercent: 61,
      pressureHpa: 1014.5,
    },
    today: {
      minTemperatureC: 11.3,
      maxTemperatureC: 21.9,
      precipitationMm: 0.4,
      precipitationProbabilityPercent: 20,
      sunrise: '2026-10-01T06:12',
      sunset: '2026-10-01T17:53',
    },
  }
}
