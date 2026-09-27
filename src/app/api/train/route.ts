import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { PkpApiError, type GetDisruptionsResult, type NameDictionaries } from '@/lib/pkp/client'
import { buildTrainDetailStops, type TrainDetailStop } from '@/lib/board/trainDetail'
import { attachStopCoordinates } from './coordinates'
import type { TrainDetailStopWithCoords } from '@/lib/board/mapPosition'
import { createTtlCache } from '@/lib/cache'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'
import { isOperatingDateInWindow } from '@/lib/pkp/time'
import { logEvent } from '@/lib/log'

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

/**
 * PKP zapomina o pociągu, który nigdy nie kursował pod tym kluczem (literówka
 * w URL, stary link) -- bez pamięci każde ponowne kliknięcie odpalałoby to
 * samo zapytanie do PKP na nowo. 10 min: krócej niż sukces nie musiałby być,
 * ale wystarczająco, żeby zgasić powtórne kliknięcia tego samego martwego linku.
 */
const NOT_FOUND_CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Globalny limit zapytań PKP z powodu cache miss na tej trasie w oknie jednej
 * godziny (AGENTS.md #3, jedna replika -- stan w pamięci procesu, AGENTS.md #5).
 * Trafienia cache'u, zapamiętane 404 i dołączenia do trwającego `inFlight` NIE
 * liczą się -- tylko realny nowy fetch do PKP.
 *
 * Koszt jednego miss (`client.ts` `fetchRoute`):
 *  - `/operations/train/...` -- zawsze, nigdy nie cache'owane: 1
 *  - `/schedules/route/...` -- 0, gdy trasa już jest w cache'u 24h z
 *    wcześniejszego miss tego samego pociągu (stan ustalony), ale 1 przy
 *    zimnym cache'u (pierwsze kliknięcie tego pociągu w ogóle) i 1 przy
 *    zmyślonym scheduleId/orderId (404 trasy, nie cache'owany -- patrz komentarz
 *    przy `fetchRoute`)
 *  - `client.getDisruptions(...)` -- klucz cache'u zawęża się do stacji TEGO
 *    pociągu i pojedynczego dnia, więc w praktyce prawie zawsze nowe
 *    zapytanie: 1
 * Razem: 2 przy ciepłym cache'u trasy, 3 przy zimnym (pierwsze kliknięcie) i
 * 2 dla zmyślonych ID (operacja 404 + trasa 404, bez utrudnień -- `stationIds`
 * puste).
 *
 * OWNER DECISION (2026-09-27): limit zostaje na 21, mimo że worst case
 * (wszystkie 21 misses zimne, po 3 zapytania) daje 21×3 + ~40 poller +
 * ~7 network-stats ≈ 110/h > twardy limit 100/h. Świadomie zaakceptowane
 * ryzyko do czasu przyznania klucza z wyższym limitem PKP (w trakcie
 * ubiegania się). Jeśli klucz zostanie przy 100/h, obniżyć limit do
 * floor((90 − 40 − 7) / 3) = floor(43 / 3) = 14.
 */
const HOURLY_MISS_CAP = 21
const HOUR_MS = 3_600_000

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
  stops: TrainDetailStopWithCoords[]
}

const cache = createTtlCache<TrainDetailApiResponse>({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES })
const notFoundCache = createTtlCache<true>({ ttlMs: NOT_FOUND_CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES })

/**
 * Licznik miss w oknie bieżącej godziny epoki -- zerowany, gdy zmienia się
 * `Math.floor(Date.now() / HOUR_MS)`, więc nie trzeba osobnego timera do
 * resetu (jedna replika, stan w pamięci procesu, AGENTS.md #5).
 */
let missWindow = { hour: -1, count: 0 }

/** `true` i inkrementuje licznik, gdy pod limitem; `false` bez efektu ubocznego, gdy limit wyczerpany. */
function consumeMissBudget(): boolean {
  const hour = Math.floor(Date.now() / HOUR_MS)
  if (missWindow.hour !== hour) {
    missWindow = { hour, count: 0 }
  }
  if (missWindow.count >= HOURLY_MISS_CAP) {
    return false
  }
  missWindow.count += 1
  return true
}

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

  const rawStops: TrainDetailStop[] = buildTrainDetailStops(
    detail.operation,
    detail.route,
    detail.stationNames,
    disruptionsResult.disruptions,
    disruptionsResult.disruptionTypes
  )
  const stops = await attachStopCoordinates(rawStops)

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

  if (!isOperatingDateInWindow(operatingDate, new Date())) {
    return NextResponse.json({ error: 'Nieprawidłowa data kursowania' }, { status: 400 })
  }

  const cacheKey = `${scheduleId}-${orderId}-${operatingDate}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) {
    return NextResponse.json(cached)
  }

  if (notFoundCache.get(cacheKey) !== undefined) {
    return NextResponse.json({ error: 'Nie znaleziono połączenia' }, { status: 404 })
  }

  try {
    let pending = inFlight.get(cacheKey)
    if (pending === undefined) {
      // Dołączenie do trwającego pobrania nie kosztuje kolejnego zapytania do
      // PKP -- limit liczy się tylko przy zakładaniu NOWEGO pobrania.
      if (!consumeMissBudget()) {
        logEvent('warn', 'api.train.hourly_cap_reached', { limit: HOURLY_MISS_CAP })
        return NextResponse.json(
          { error: 'Chwilowo zbyt wiele zapytań o szczegóły połączeń. Spróbuj ponownie za kilka minut.' },
          { status: 503 }
        )
      }
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
        notFoundCache.set(cacheKey, true)
        return NextResponse.json({ error: 'Nie znaleziono połączenia' }, { status: 404 })
      }
      // 5xx z PKP -> 502 (błąd zależności), reszta (np. 401 błędnego klucza) przechodzi wprost.
      const status = err.status >= 500 ? 502 : err.status
      return NextResponse.json({ error: 'Błąd pobierania danych z PKP' }, { status })
    }
    logEvent('error', 'api.train.unexpected_error', {}, err)
    return NextResponse.json({ error: 'Nieoczekiwany błąd' }, { status: 500 })
  }
}
