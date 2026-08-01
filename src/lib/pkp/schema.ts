import { z } from 'zod'

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
    plannedArrival: z.string().nullable().optional().default(null),
    plannedDeparture: z.string().nullable().optional().default(null),
    actualArrival: z.string().nullable().optional().default(null),
    actualDeparture: z.string().nullable().optional().default(null),
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
