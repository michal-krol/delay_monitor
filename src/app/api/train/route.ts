import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { PkpApiError } from '@/lib/pkp/client'
import { buildTrainDetailStops, type TrainDetailStop } from '@/lib/board/trainDetail'
import { createTtlCache } from '@/lib/cache'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

/**
 * `scheduleId`/`orderId` nie są ID stacji, ale mają ten sam kształt (liczba,
 * do 10 cyfr) — ten sam wzorzec, żeby nie utrzymywać dwóch identycznych regexów.
 */
const ID_PATTERN = STATION_ID_PATTERN

/**
 * Krótkie TTL, bo to zapytanie wykonywane dopiero po kliknięciu (patrz
 * roadmapa) — chroni budżet, gdy kilku użytkowników klika ten sam pociąg
 * w krótkim czasie, bez pretensji do świeżości poza tym oknem.
 */
const CACHE_TTL_MS = 90_000
const CACHE_MAX_ENTRIES = 200

export type TrainDetailApiResponse = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainStatus: string | null
  carrierCode: string | null
  category: string | null
  routeName: string | null
  stops: TrainDetailStop[]
}

const cache = createTtlCache<TrainDetailApiResponse>({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES })

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scheduleId = searchParams.get('scheduleId')
  const orderId = searchParams.get('orderId')
  const operatingDate = searchParams.get('operatingDate')

  if (!scheduleId || !orderId || !operatingDate) {
    return NextResponse.json({ error: 'Brak wymaganych parametrów' }, { status: 400 })
  }

  // Bez echa wartości w odpowiedzi — nie odbijamy wejścia użytkownika.
  if (!ID_PATTERN.test(scheduleId) || !ID_PATTERN.test(orderId) || !OPERATING_DATE_PATTERN.test(operatingDate)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator połączenia' }, { status: 400 })
  }

  const cacheKey = `${scheduleId}-${orderId}-${operatingDate}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) {
    return NextResponse.json(cached)
  }

  let detail
  try {
    detail = await client.getTrainDetail(scheduleId, orderId, operatingDate)
  } catch (err) {
    if (err instanceof PkpApiError) {
      if (err.status === 404) {
        return NextResponse.json({ error: 'Nie znaleziono połączenia' }, { status: 404 })
      }
      // 5xx z PKP -> 502 (błąd zależności), reszta (np. 401 błędnego klucza) przechodzi wprost.
      const status = err.status >= 500 ? 502 : err.status
      return NextResponse.json({ error: 'Błąd pobierania danych z PKP' }, { status })
    }
    console.error('Błąd pobierania szczegółów połączenia', err)
    return NextResponse.json({ error: 'Nieoczekiwany błąd' }, { status: 500 })
  }

  const stops: TrainDetailStop[] = buildTrainDetailStops(detail.operation, detail.route, detail.stationNames)

  const response: TrainDetailApiResponse = {
    scheduleId: detail.operation.scheduleId,
    orderId: detail.operation.orderId,
    operatingDate,
    trainStatus: detail.operation.trainStatus,
    carrierCode: detail.route?.carrierCode ?? null,
    category: detail.route?.commercialCategorySymbol ?? null,
    routeName: detail.route?.name ?? null,
    stops,
  }

  cache.set(cacheKey, response)
  return NextResponse.json(response)
}
