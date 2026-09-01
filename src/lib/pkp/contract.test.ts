import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Test kontraktowy: czy publiczny swagger PKP nadal opisuje pola, na których
 * stoi `schema.ts`. NIE uruchamia się w zwykłym `npm run test` — wymaga sieci,
 * a zewnętrzne API nie może wywalić lokalnej bramki. Uruchomienie:
 *
 *   PKP_CONTRACT=1 npm run test -- contract          (POSIX / Git Bash)
 *   $env:PKP_CONTRACT='1'; npm run test -- contract  (PowerShell)
 *
 * (Bez `cross-env` i osobnego skryptu w package.json — prefiks zmiennej
 * wystarcza, a nowa zależność dla jednego testu diagnostycznego to przesada.)
 *
 * Powód istnienia: 2026-08-30 `withPlanned=true` przestał działać po stronie
 * PKP i `fullRoute=true` zaczął gubić `stations`. Oba objawiały się dopiero
 * przez PUSTĄ tablicę, po dwóch-trzech dobach. Ten test nie sprawdza wartości
 * ani typów co do joty — pyta wyłącznie o **obecność pól i parametrów**, bo to
 * ich zniknięcie robi ciche awarie. Swagger jest publiczny (bez klucza, bez
 * kosztu z limitu 100/h).
 */

const SWAGGER_URL = 'https://pdp-api.plk-sa.pl/swagger/v1/swagger.json'

type SwaggerSchema = {
  properties?: Record<string, unknown>
}
type Swagger = {
  paths: Record<string, Record<string, { parameters?: { name: string }[] }>>
  components: { schemas: Record<string, SwaggerSchema> }
}

describe.skipIf(process.env.PKP_CONTRACT !== '1')('kontrakt: swagger PKP ↔ schema.ts', () => {
  let swagger: Swagger

  beforeAll(async () => {
    const response = await fetch(SWAGGER_URL)
    expect(response.ok, `swagger nie odpowiada: ${response.status}`).toBe(true)
    swagger = (await response.json()) as Swagger
  })

  /** Nazwy właściwości danego DTO. Rzuca czytelnie, gdy DTO zniknęło/zmieniło nazwę. */
  function propsOf(dto: string): string[] {
    const schema = swagger.components?.schemas?.[dto]
    expect(schema, `DTO "${dto}" nie istnieje w swaggerze (zmiana nazwy?) — dostępne: ${Object.keys(swagger.components?.schemas ?? {}).join(', ')}`).toBeDefined()
    return Object.keys(schema.properties ?? {})
  }

  function expectFields(dto: string, ...fields: string[]): void {
    const present = propsOf(dto)
    for (const field of fields) {
      expect(present, `${dto}.${field} zniknęło ze swaggera`).toContain(field)
    }
  }

  function expectQueryParams(path: string, ...names: string[]): void {
    const get = swagger.paths?.[path]?.get
    expect(get, `ścieżka GET ${path} nie istnieje w swaggerze`).toBeDefined()
    const present = (get.parameters ?? []).map((p) => p.name)
    for (const name of names) {
      expect(present, `parametr ${name} zniknął z ${path}`).toContain(name)
    }
  }

  it('/operations — pola realizacji, na których stoi rawTrainOperationSchema / rawOperationStationSchema', () => {
    expectFields('OperationResponseDto', 'trains', 'stations', 'pagination')
    expectFields('TrainOperationDto', 'scheduleId', 'orderId', 'trainOrderId', 'operatingDate', 'trainStatus', 'stations')
    expectFields(
      'OperationStationDto',
      'stationId',
      'plannedArrival',
      'plannedDeparture',
      'actualArrival',
      'actualDeparture',
      'arrivalDelayMinutes',
      'departureDelayMinutes',
      'isConfirmed',
      'isCancelled'
    )
    // hasNextPage -> wykrywanie ucięcia (poller.ts, truncatedRefetch)
    expectFields('PaginationInfoDto', 'totalCount', 'hasNextPage')
    // withPlanned=true niesie planowe czasy; pageSize=5000 to nasz sufit
    expectQueryParams('/api/v1/operations', 'stations', 'withPlanned', 'pageSize', 'fullRoutes')
  })

  it('/schedules — pola rozkładu, na których stoi rawRouteSchema / rawRouteStopSchema', () => {
    expectFields('ScheduleResponseDto', 'routes', 'dictionaries')
    expectFields(
      'RouteDto',
      'scheduleId',
      'orderId',
      'trainOrderId',
      'carrierCode',
      'commercialCategorySymbol',
      'name',
      'nationalNumber',
      'operatingDates',
      'stations'
    )
    expectFields(
      'StationOnRouteDto',
      'stationId',
      'arrivalTime',
      'departureTime',
      'arrivalDay',
      'departureDay',
      'arrivalPlatform',
      'arrivalTrack',
      'departurePlatform',
      'departureTrack',
      'stopTypeName'
    )
    expectFields('DictionariesDto', 'carriers', 'stations', 'commercialCategories')
    expectFields('StationDictionaryDto', 'id', 'name')
    // fullRoute=true dokleja stations do każdej trasy (loadSchedules)
    expectQueryParams('/api/v1/schedules', 'stations', 'dateFrom', 'dateTo', 'fullRoute')
  })

  it('/schedules/route/{scheduleId}/{orderId} — ta sama trasa co w /schedules (RouteDto)', () => {
    expect(swagger.paths['/api/v1/schedules/route/{scheduleId}/{orderId}']?.get).toBeDefined()
    // schema odpowiedzi to RouteDto — pokryte testem wyżej
  })

  it('/operations/statistics — liczniki statusów (operationsStatisticsResponseSchema)', () => {
    expectFields(
      'OperationStatisticsDto',
      'generatedAt',
      'totalTrains',
      'notStarted',
      'inProgress',
      'completed',
      'cancelled',
      'partialCancelled'
    )
  })

  it('/schedules/routes/{date} — lekka lista tras dnia (dailyRoutesResponseSchema)', () => {
    expectFields('RouteIdsResponseDto', 'routes')
    expectFields('RouteIdDto', 'carrierCode')
  })

  it('/disruptions — utrudnienia (disruptionsResponseSchema)', () => {
    expectFields('DisruptionResponseDto', 'disruptions', 'disruptionTypes')
    expectFields('DisruptionDto', 'disruptionId', 'message', 'affectedRoutes')
    expectFields('AffectedRouteDto', 'scheduleId', 'orderId', 'operatingDate', 'stationId')
  })

  it('/data-version — sygnał zamrożenia feedu (dataVersionResponseSchema)', () => {
    expectFields('DataVersionResponse', 'dataVersion', 'schedulesVersion', 'operationsVersion', 'timestamp')
  })

  it('/dictionaries — pełne nazwy przewoźników i kategorii', () => {
    expectFields('CarriersResponse', 'carriers')
    expectFields('CarrierDto', 'code', 'name')
    expectFields('CommercialCategoriesResponse', 'commercialCategories')
    expectFields('CommercialCategoryDto', 'code', 'name', 'carrierCode')
    expectFields('StationsResponse', 'stations')
    expectFields('StationDto', 'id', 'name')
  })
})
