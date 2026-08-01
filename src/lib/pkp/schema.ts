import { z } from 'zod'

export const stationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .passthrough()

export const stationSearchResponseSchema = z
  .object({
    stations: z.array(stationSchema),
  })
  .passthrough()

const rawStopSchema = z
  .object({
    plannedArrival: z.string().nullable().optional().default(null),
    actualArrival: z.string().nullable().optional().default(null),
    plannedDeparture: z.string().nullable().optional().default(null),
    actualDeparture: z.string().nullable().optional().default(null),
    delayMinutes: z.number().nullable().optional().default(null),
    cancelled: z.boolean().optional().default(false),
    platform: z.string().nullable().optional().default(null),
  })
  .passthrough()

export const rawOperationSchema = z
  .object({
    stationId: z.string(),
    trainNumber: z.string(),
    carrier: z.string().optional().default('nieznany'),
    category: z.string().optional().default('nieznana'),
    originStationName: z.string().optional().default(''),
    destinationStationName: z.string().optional().default(''),
    stop: rawStopSchema,
  })
  .passthrough()

export const operationsResponseSchema = z
  .object({
    operations: z.array(rawOperationSchema),
  })
  .passthrough()
