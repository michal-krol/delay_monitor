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

const rawRouteSchema = z
  .object({
    scheduleId: z.coerce.string(),
    orderId: z.coerce.string(),
    carrierCode: z.string().nullable().optional().default(null),
    commercialCategorySymbol: z.string().nullable().optional().default(null),
    name: z.string().nullable().optional().default(null),
    nationalNumber: z.string().nullable().optional().default(null),
  })
  .passthrough()

export const schedulesResponseSchema = z
  .object({
    routes: z
      .array(rawRouteSchema)
      .nullish()
      .transform((routes) => routes ?? []),
  })
  .passthrough()
