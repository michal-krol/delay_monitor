import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { PkpApiError, type GetDisruptionsResult, type NameDictionaries } from '@/lib/pkp/client'
import { buildTrainDetailStops, type TrainDetailStop } from '@/lib/board/trainDetail'
import { createTtlCache } from '@/lib/cache'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

const EMPTY_DISRUPTIONS: GetDisruptionsResult = { disruptions: [], disruptionTypes: {} }

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
  /** Pełna nazwa przewoźnika, gdy słownik ją zna (patrz `client.getNameDictionaries()`) -- `null` gdy nieznana, appka pokazuje wtedy surowy `carrierCode`. */
  carrierName: string | null
  category: string | null
  /** jw., dla kategorii -- rozwiązywane po kluczu `carrierCode|category`, bo sam kod kategorii jest niejednoznaczny między przewoźnikami. */
  categoryName: string | null
  routeName: string | null
  /**
   * Numer krajowy pociągu (`RouteDto.nationalNumber`) — na żywym API wypełniony
   * w każdej z 475 sprawdzonych tras, w przeciwieństwie do `routeName` (316/475).
   * Razem z `category` daje nagłówek panelu w formie, jakiej pasażer używa:
   * „IC 2706". `null` tylko wtedy, gdy trasy w ogóle nie udało się dopasować.
   */
  nationalNumber: string | null
  stops: TrainDetailStop[]
}

const cache = createTtlCache<TrainDetailApiResponse>({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES })

/**
 * Cache sprawdzany przed `await`, zapisywany po nim — bez uchwytów na trwające
 * pobrania równoległe kliknięcia w ten sam, jeszcze niewidziany pociąg (albo
 * kilku użytkowników klikających go w tym samym momencie) trafiają wszystkie
 * w pustą pamięć, każde odpalając własne pobranie z PKP (AGENTS.md #4) — ten
 * sam wzorzec co `schedulesInFlight` w `client.ts`.
 */
const inFlight = new Map<string, Promise<TrainDetailApiResponse>>()

async function loadTrainDetail(scheduleId: string, orderId: string, operatingDate: string): Promise<TrainDetailApiResponse> {
  // Niezależne od getTrainDetail() -- słowniki nazw są cache'owane osobno w
  // kliencie (24h) i nie zależą od tego konkretnego przejazdu. Wzbogacenie,
  // nie rdzeń odpowiedzi: gdy zawiedzie, panel ma nadal działać z surowymi
  // kodami zamiast pełnych nazw, nie zwracać błędu za coś pobocznego.
  const [detail, names] = await Promise.all([
    client.getTrainDetail(scheduleId, orderId, operatingDate),
    client.getNameDictionaries().catch((): NameDictionaries => ({ carrierNames: {}, categoryNames: {} })),
  ])

  // Wzbogacenie, nie rdzeń odpowiedzi -- ten sam duch co getNameDictionaries()
  // wyżej: awaria pobrania utrudnień ma zostawić panel działający bez
  // wskaźników, nie zwracać błędu za coś pobocznego. Stacje TEGO pociągu,
  // zawężone do samego operatingDate -- osobna linia budżetu od pollera
  // (AGENTS.md #3), nie domyślne okno dziś+jutro.
  const stationIds = [...new Set(detail.operation.stations.map((stop) => stop.stationId))]
  const disruptionsResult =
    stationIds.length > 0
      ? await client.getDisruptions(stationIds, operatingDate, operatingDate).catch((): GetDisruptionsResult => EMPTY_DISRUPTIONS)
      : EMPTY_DISRUPTIONS

  const stops: TrainDetailStop[] = buildTrainDetailStops(
    detail.operation,
    detail.route,
    detail.stationNames,
    disruptionsResult.disruptions,
    disruptionsResult.disruptionTypes
  )

  const carrierCode = detail.route?.carrierCode ?? null
  const category = detail.route?.commercialCategorySymbol ?? null

  return {
    scheduleId: detail.operation.scheduleId,
    orderId: detail.operation.orderId,
    operatingDate,
    trainStatus: detail.operation.trainStatus,
    carrierCode,
    carrierName: carrierCode !== null ? (names.carrierNames[carrierCode] ?? null) : null,
    category,
    categoryName:
      carrierCode !== null && category !== null ? (names.categoryNames[`${carrierCode}|${category}`] ?? null) : null,
    routeName: detail.route?.name ?? null,
    nationalNumber: detail.route?.nationalNumber ?? null,
    stops,
  }
}

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

  try {
    let pending = inFlight.get(cacheKey)
    if (pending === undefined) {
      pending = loadTrainDetail(scheduleId, orderId, operatingDate).finally(() => {
        inFlight.delete(cacheKey)
      })
      inFlight.set(cacheKey, pending)
    }
    const response = await pending
    cache.set(cacheKey, response)
    return NextResponse.json(response)
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
}
