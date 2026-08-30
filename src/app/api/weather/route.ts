import { NextResponse } from 'next/server'
import { getStationCoordinates } from '@/lib/weather/coordinates'
import { fetchOpenMeteoWeather, WeatherApiError, type OpenMeteoSnapshot } from '@/lib/weather/client'
import { createTtlCache } from '@/lib/cache'
import { STATION_ID_PATTERN } from '@/lib/validation'

/**
 * Open-Meteo odświeża `current` u siebie co ~15 min -- 25 min to zapas jednego
 * pominiętego cyklu bez zbędnego dobijania upstreamu na każde kolejne wejście
 * na tę samą stację.
 */
const CACHE_TTL_MS = 25 * 60_000
/** Przestrzeń kluczy to "stacje odwiedzone w oknie TTL" -- luźniejszy limit niż /api/train (200), bo to agregat wszystkich użytkowników, nie pojedynczych kliknięć w pociąg. */
const CACHE_MAX_ENTRIES = 300

export type WeatherApiResponse =
  | { available: true; weather: OpenMeteoSnapshot & { fetchedAt: string } }
  | { available: false; reason: 'no-location' }

const cache = createTtlCache<WeatherApiResponse>({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES })

/**
 * Cache sprawdzany przed `await`, zapisywany po nim -- bez tego równoległe
 * kliknięcia w tę samą, jeszcze niescache'owaną stację odpaliłyby każde
 * własne zapytanie do Open-Meteo. Ten sam wzorzec co `inFlight` w
 * `/api/train/route.ts`.
 */
const inFlight = new Map<string, Promise<WeatherApiResponse>>()

async function loadWeather(stationId: string): Promise<WeatherApiResponse> {
  const coordinates = await getStationCoordinates(stationId)
  if (coordinates === null) return { available: false, reason: 'no-location' }

  const snapshot = await fetchOpenMeteoWeather(coordinates.lat, coordinates.lon)
  return { available: true, weather: { ...snapshot, fetchedAt: new Date().toISOString() } }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stationId = searchParams.get('stationId')

  if (!stationId) {
    return NextResponse.json({ error: 'Brak wymaganych parametrów' }, { status: 400 })
  }

  // Bez echa wartości w odpowiedzi -- nie odbijamy wejścia użytkownika.
  if (!STATION_ID_PATTERN.test(stationId)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator stacji' }, { status: 400 })
  }

  const cached = cache.get(stationId)
  if (cached !== undefined) {
    return NextResponse.json(cached)
  }

  try {
    let pending = inFlight.get(stationId)
    if (pending === undefined) {
      pending = loadWeather(stationId).finally(() => {
        inFlight.delete(stationId)
      })
      inFlight.set(stationId, pending)
    }
    const response = await pending
    // `available:false` jest tu też cache'owane -- plik statyczny współrzędnych
    // się nie zmienia w runtime, więc to trwały, poprawny wynik, nie błąd.
    cache.set(stationId, response)
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof WeatherApiError) {
      // 5xx/timeout z Open-Meteo -> 502 (błąd zależności), reszta przechodzi wprost.
      const status = err.status >= 500 ? 502 : err.status
      return NextResponse.json({ error: 'Błąd pobierania danych pogodowych' }, { status })
    }
    console.error('Błąd pobierania pogody', err)
    return NextResponse.json({ error: 'Nieoczekiwany błąd' }, { status: 500 })
  }
}
