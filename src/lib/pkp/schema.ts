import { z } from 'zod'
import { normalizeApiTimestamp } from './time'

/**
 * ID PKP bywa liczbą lub stringiem w odpowiedzi API, więc wymaga koercji —
 * ale `z.coerce.string()` koerciuje też `null` do stringa `"null"`
 * (`String(null) === "null"`), zamiast go odrzucić. Jawny `z.union` nie ma
 * tej dziury: `null` nie pasuje do żadnej gałęzi, więc parsowanie pada, jak
 * przy każdym innym brakującym/błędnym ID na tej granicy zaufania (AGENTS.md #4).
 */
const idString = z.union([z.string(), z.number()]).transform(String)

const apiTimestamp = z
  .string()
  .nullable()
  .optional()
  .default(null)
  .transform((value) => (value === null ? null : normalizeApiTimestamp(value)))

export const stationSchema = z
  .object({
    id: idString,
    name: z
      .string()
      .nullable()
      .transform((name) => name ?? ''),
  })
  .passthrough()

export const stationSearchResponseSchema = z
  .object({
    stations: z.array(stationSchema),
  })
  .passthrough()

const rawOperationStationSchema = z
  .object({
    stationId: idString,
    plannedArrival: apiTimestamp,
    plannedDeparture: apiTimestamp,
    actualArrival: apiTimestamp,
    actualDeparture: apiTimestamp,
    arrivalDelayMinutes: z.number().nullable().optional().default(null),
    departureDelayMinutes: z.number().nullable().optional().default(null),
    isCancelled: z.boolean().optional().default(false),
    /** Czy realizacja tego przystanku jest potwierdzona, czy to wciąż plan. Używane w panelu szczegółów połączenia. */
    isConfirmed: z.boolean().optional().default(false),
  })
  .passthrough()

/** Kształt jednego pociągu z `/operations` — ten sam co odpowiedź `/operations/train/{scheduleId}/{orderId}/{operatingDate}` (patrz `getTrainDetail` w `client.ts`). */
export const rawTrainOperationSchema = z
  .object({
    scheduleId: idString,
    orderId: idString,
    trainOrderId: z.coerce.string().nullable().optional().default(null),
    /** Data kursowania (yyyy-MM-dd) — wymagana przez `/operations/train/{scheduleId}/{orderId}/{operatingDate}`. */
    operatingDate: z.string().nullable().optional().default(null),
    trainStatus: z.string().nullable().optional().default(null),
    stations: z
      .array(rawOperationStationSchema)
      .nullish()
      .transform((stations) => stations ?? []),
  })
  .passthrough()

/**
 * Stronicowanie `/operations`. Potrzebne wyłącznie po to, żeby wykryć, że
 * jedna strona nie pomieściła całego dnia — statystyki stacji (`stationStats.ts`)
 * liczą się z CAŁEGO dnia, więc ciche ucięcie zaniżałoby je bez śladu.
 * Klient nie dociąga kolejnych stron (patrz `getOperations()` w `client.ts`).
 */
const paginationSchema = z
  .object({
    totalCount: z.number().int().nullable().optional().default(null),
    hasNextPage: z.boolean().nullable().optional().default(null),
  })
  .passthrough()

export const operationsResponseSchema = z
  .object({
    pagination: paginationSchema.nullish().transform((pagination) => pagination ?? null),
    trains: z
      .array(rawTrainOperationSchema)
      .nullish()
      .transform((trains) => trains ?? []),
    stations: z
      .record(z.string(), z.string())
      .nullish()
      .transform((stations) => stations ?? {}),
  })
  .passthrough()

const rawRouteStopSchema = z
  .object({
    stationId: idString,
    arrivalPlatform: z.string().nullable().optional().default(null),
    arrivalTrack: z.string().nullable().optional().default(null),
    departurePlatform: z.string().nullable().optional().default(null),
    departureTrack: z.string().nullable().optional().default(null),
    /**
     * Planowy czas (HH:mm:ss, lokalny warszawski) — jedyne źródło planu dla
     * pojedynczego przystanku. `/operations/train/{scheduleId}/{orderId}/{operatingDate}`
     * (realizacja) nie niesie planowych czasów ani opóźnienia per przystanek,
     * tylko faktyczne — stwierdzone bezpośrednio na żywym API, nie w dokumentacji.
     * Patrz `buildTrainDetailStops` w `board/trainDetail.ts`.
     */
    arrivalTime: z.string().nullable().optional().default(null),
    departureTime: z.string().nullable().optional().default(null),
    /** Przesunięcie dnia względem `operatingDate`, gdy przystanek wypada po północy. `null`/brak = ten sam dzień. */
    arrivalDay: z.number().int().nullable().optional().default(null),
    departureDay: z.number().int().nullable().optional().default(null),
    /**
     * Typ postoju, gdy jest inny niż zwykły — na żywym API (475 tras, 8380
     * przystanków, Warszawa Centralna, 2026-08-27) wypełniony w 353 z nich
     * i przyjmujący dokładnie dwie wartości: „tylko dla wysiadających"
     * i „tylko dla wsiadających". Brak jest więc regułą, nie wyjątkiem —
     * i znaczy „zwykły postój", nie „brak danych". Renderowane jako
     * ostrzeżenie przy przystanku (patrz `ConnectionDetails.tsx`), bo to
     * jedyny przypadek, w którym pasażer nie może tu wsiąść/wysiąść.
     */
    stopTypeName: z.string().nullable().optional().default(null),
  })
  .passthrough()

/** Kształt jednej trasy z `/schedules` — ten sam co odpowiedź `/schedules/route/{scheduleId}/{orderId}` (patrz `getTrainDetail` w `client.ts`). */
export const rawRouteSchema = z
  .object({
    scheduleId: idString,
    orderId: idString,
    trainOrderId: z.coerce.string().nullable().optional().default(null),
    carrierCode: z.string().nullable().optional().default(null),
    commercialCategorySymbol: z.string().nullable().optional().default(null),
    name: z.string().nullable().optional().default(null),
    nationalNumber: z.string().nullable().optional().default(null),
    /**
     * Dni, w które ta trasa kursuje (yyyy-MM-dd). `/schedules` jest wołane
     * oknem dziś+jutro (patrz `scheduleDateWindow()` w `client.ts`), więc bez
     * tego pola nie da się odróżnić kursu dzisiejszego od jutrzejszego —
     * a na tym stoi liczenie „Odjazdy/Przyjazdy dzisiaj" (`stationStats.ts`).
     */
    operatingDates: z
      .array(z.string())
      .nullish()
      .transform((dates) => dates ?? []),
    stations: z
      .array(rawRouteStopSchema)
      .nullish()
      .transform((stations) => stations ?? []),
  })
  .passthrough()

export const carriersResponseSchema = z
  .object({
    carriers: z
      .array(z.object({ code: z.string().nullable(), name: z.string().nullable() }).passthrough())
      .nullish()
      .transform((carriers) => carriers ?? []),
  })
  .passthrough()
  .transform((data) => ({
    carrierNames: Object.fromEntries(
      data.carriers
        .filter((carrier): carrier is { code: string; name: string } => carrier.code !== null && carrier.name !== null)
        .map((carrier) => [carrier.code, carrier.name])
    ),
  }))

/**
 * Kod kategorii handlowej sam w sobie jest niejednoznaczny między
 * przewoźnikami (np. "Ex" = "Express" u IC, ale co innego u LEO Express) --
 * stąd klucz mapy to `carrierCode|code`, nie sam `code`.
 */
export const commercialCategoriesResponseSchema = z
  .object({
    commercialCategories: z
      .array(
        z
          .object({
            code: z.string().nullable(),
            name: z.string().nullable(),
            carrierCode: z.string().nullable(),
          })
          .passthrough()
      )
      .nullish()
      .transform((categories) => categories ?? []),
  })
  .passthrough()
  .transform((data) => ({
    categoryNames: Object.fromEntries(
      data.commercialCategories
        .filter((category): category is { code: string; name: string; carrierCode: string | null } => category.code !== null && category.name !== null)
        .map((category) => [`${category.carrierCode ?? ''}|${category.code}`, category.name])
    ),
  }))

export const schedulesResponseSchema = z
  .object({
    routes: z
      .array(rawRouteSchema)
      .nullish()
      .transform((routes) => routes ?? []),
    dictionaries: z
      .object({
        carriers: z
          .record(z.string(), z.string())
          .nullish()
          .transform((carriers) => carriers ?? {}),
        stations: z
          .record(z.string(), z.object({ id: idString, name: z.string() }).passthrough())
          .nullish()
          .transform((stations) => stations ?? {}),
        // Słownik kod -> nazwa, bez rozbicia per przewoźnik (w przeciwieństwie
        // do `commercialCategoriesResponseSchema` niżej, który dostaje osobny
        // rekord z `/dictionaries/commercial-categories`) — wystarczające dla
        // czytelnej etykiety w tabeli, przy zerowym koszcie: ten sam
        // słownik jedzie w każdej odpowiedzi `/schedules`, którą i tak
        // pobieramy co 24h.
        commercialCategories: z
          .record(z.string(), z.string())
          .nullish()
          .transform((categories) => categories ?? {}),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    carrierNames: data.dictionaries?.carriers ?? {},
    categoryNames: data.dictionaries?.commercialCategories ?? {},
    // Pełny słownik nazw stacji (id -> nazwa) — używany m.in. do rozwiązania
    // kierunku (origin/destination) na podstawie dopasowanej trasy, patrz
    // board/transform.ts. Obojętny na parametr fullRoute.
    stationNames: Object.fromEntries(
      Object.entries(data.dictionaries?.stations ?? {}).map(([id, station]) => [id, station.name])
    ),
  }))

/** `/api/v1/operations/statistics?date=` — zagregowane liczniki statusów dla całego kraju, patrz `getOperationsStatistics()` w `client.ts`. */
export const operationsStatisticsResponseSchema = z
  .object({
    generatedAt: z.string(),
    totalTrains: z.number().int().default(0),
    notStarted: z.number().int().default(0),
    inProgress: z.number().int().default(0),
    completed: z.number().int().default(0),
    cancelled: z.number().int().default(0),
    partialCancelled: z.number().int().default(0),
  })
  .passthrough()

/** `/api/v1/schedules/routes/{date}` — lekka lista tras całego kraju na dany dzień, bez przystanków. Tylko `carrierCode` jest nam tu potrzebny (rozkład ruchu wg przewoźnika). */
export const dailyRoutesResponseSchema = z
  .object({
    routes: z
      .array(z.object({ carrierCode: z.string().nullable().optional().default(null) }).passthrough())
      .nullish()
      .transform((routes) => routes ?? []),
  })
  .passthrough()

/** `/api/v1/disruptions` — tylko liczność jest tu potrzebna (patrz `getDisruptionCount()`), więc kształt pojedynczego utrudnienia nas nie obchodzi. */
export const disruptionsCountResponseSchema = z
  .object({
    disruptions: z
      .array(z.unknown())
      .nullish()
      .transform((disruptions) => disruptions ?? []),
  })
  .passthrough()
  .transform((data) => data.disruptions.length)

const disruptionAffectedRouteSchema = z
  .object({
    scheduleId: idString,
    orderId: idString,
    operatingDate: z.string(),
    stationId: idString,
  })
  .passthrough()

/**
 * `disruptionTypeCode`/`startStationId`/`endStationId` z dokumentacji OpenAPI
 * świadomie pominięte — zweryfikowane na żywych danych (36 rekordów, 4 duże
 * stacje, 2026-08-26) jako zawsze null/nieobecne. Nie buduj na nich logiki
 * dopasowania, patrz `board/disruptions.ts`.
 */
const rawDisruptionSchema = z
  .object({
    disruptionId: z.coerce.number(),
    message: z.string().nullable().optional().default(null),
    affectedRoutes: z
      .array(disruptionAffectedRouteSchema)
      .nullish()
      .transform((routes) => routes ?? []),
  })
  .passthrough()

/**
 * `/api/v1/disruptions` (pełny kształt, w przeciwieństwie do
 * `disruptionsCountResponseSchema` wyżej) — patrz `getDisruptions()` w
 * `client.ts`. Zawsze wołane z `dictionaries=true`, więc `disruptionTypes`
 * jedzie w tej samej odpowiedzi bez dodatkowego zapytania.
 */
export const disruptionsResponseSchema = z
  .object({
    disruptions: z
      .array(rawDisruptionSchema)
      .nullish()
      .transform((disruptions) => disruptions ?? []),
    disruptionTypes: z
      .record(z.string(), z.string())
      .nullish()
      .transform((types) => types ?? {}),
  })
  .passthrough()

/**
 * `/api/v1/data-version` — trzy identyfikatory wersji danych plus znacznik
 * czasu ostatniej aktualizacji po stronie PKP.
 *
 * Używane WYŁĄCZNIE diagnostycznie: gdy `/operations` przestaje nieść dzisiejsze
 * pociągi, ten endpoint rozstrzyga, czy dane po stronie PKP w ogóle się
 * zmieniają. Zmierzone 2026-08-31: `timestamp` stał w miejscu 14 h 49 min,
 * a wszystkie trzy identyfikatory były niezmienione między odczytami.
 *
 * Świadomie NIE do sterowania cache'em rozkładu — to zostało zbadane wcześniej
 * i odrzucone (identyfikatory rotują szybciej niż nasze TTL i reagują na szum
 * w nieparsowanym polu `connections[].id`; patrz README, „Inne endpointy API").
 * Tamten wniosek dotyczył oszczędzania pobrań i nadal obowiązuje.
 */
export const dataVersionResponseSchema = z
  .object({
    dataVersion: z.string().nullable().optional().default(null),
    schedulesVersion: z.string().nullable().optional().default(null),
    operationsVersion: z.string().nullable().optional().default(null),
    timestamp: z.string().nullable().optional().default(null),
  })
  .passthrough()
