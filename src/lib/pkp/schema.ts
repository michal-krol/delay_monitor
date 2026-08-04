import { z } from 'zod'
import { normalizeApiTimestamp } from './time'

const apiTimestamp = z
  .string()
  .nullable()
  .optional()
  .default(null)
  .transform((value) => (value === null ? null : normalizeApiTimestamp(value)))

export const stationSchema = z
  .object({
    id: z.coerce.string(),
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
    stationId: z.coerce.string(),
    plannedArrival: apiTimestamp,
    plannedDeparture: apiTimestamp,
    actualArrival: apiTimestamp,
    actualDeparture: apiTimestamp,
    arrivalDelayMinutes: z.number().nullable().optional().default(null),
    departureDelayMinutes: z.number().nullable().optional().default(null),
    isCancelled: z.boolean().optional().default(false),
  })
  .passthrough()

const rawTrainOperationSchema = z
  .object({
    scheduleId: z.coerce.string(),
    orderId: z.coerce.string(),
    trainOrderId: z.coerce.string().nullable().optional().default(null),
    trainStatus: z.string().nullable().optional().default(null),
    stations: z
      .array(rawOperationStationSchema)
      .nullish()
      .transform((stations) => stations ?? []),
  })
  .passthrough()

export const operationsResponseSchema = z
  .object({
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
    stationId: z.coerce.string(),
    arrivalPlatform: z.string().nullable().optional().default(null),
    arrivalTrack: z.string().nullable().optional().default(null),
    departurePlatform: z.string().nullable().optional().default(null),
    departureTrack: z.string().nullable().optional().default(null),
  })
  .passthrough()

const rawRouteSchema = z
  .object({
    scheduleId: z.coerce.string(),
    orderId: z.coerce.string(),
    trainOrderId: z.coerce.string().nullable().optional().default(null),
    carrierCode: z.string().nullable().optional().default(null),
    commercialCategorySymbol: z.string().nullable().optional().default(null),
    name: z.string().nullable().optional().default(null),
    nationalNumber: z.string().nullable().optional().default(null),
    stations: z
      .array(rawRouteStopSchema)
      .nullish()
      .transform((stations) => stations ?? []),
  })
  .passthrough()

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
          .record(z.string(), z.object({ id: z.coerce.string(), name: z.string() }).passthrough())
          .nullish()
          .transform((stations) => stations ?? {}),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    carrierNames: data.dictionaries?.carriers ?? {},
    // Pełny słownik nazw stacji (id -> nazwa) — używany m.in. do rozwiązania
    // kierunku (origin/destination) na podstawie dopasowanej trasy, patrz
    // board/transform.ts. Obojętny na parametr fullRoute.
    stationNames: Object.fromEntries(
      Object.entries(data.dictionaries?.stations ?? {}).map(([id, station]) => [id, station.name])
    ),
  }))
