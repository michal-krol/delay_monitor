import { z } from 'zod'

/**
 * Kształt `vehicles.json` (mkuran) — brak publicznego schematu, zweryfikowany
 * ręcznie 2026-09-04: { time, positions: [{ id, timestamp, lat, lon,
 * side_number, trip_id, bearing }] }. `trip_id` w tym samym formacie co
 * `stop_times.txt`. Zero pola opóźnienia — feed go nie ma i my go nie tworzymy.
 */
export type VehiclePosition = {
  id: string
  tripId: string
  lat: number
  lon: number
  sideNumber: string
  bearing: number | null
  timestamp: string
}

const positionSchema = z
  .object({
    id: z.string().optional(),
    timestamp: z.string().optional(),
    lat: z.number(),
    lon: z.number(),
    side_number: z.union([z.string(), z.number()]).optional(),
    trip_id: z.string().min(1),
    bearing: z.number().nullish(),
  })
  .transform((r) => ({
    id: r.id ?? '',
    tripId: r.trip_id,
    lat: r.lat,
    lon: r.lon,
    sideNumber: r.side_number === undefined ? '' : String(r.side_number),
    bearing: r.bearing ?? null,
    timestamp: r.timestamp ?? '',
  }))

const feedSchema = z.object({ time: z.string().optional(), positions: z.array(z.unknown()) })

export function parseVehicleFeed(json: unknown): {
  positions: VehiclePosition[]
  droppedPositions: number
  feedTime: string | null
} {
  const feed = feedSchema.safeParse(json)
  if (!feed.success) return { positions: [], droppedPositions: 0, feedTime: null }

  const positions: VehiclePosition[] = []
  let droppedPositions = 0
  for (const raw of feed.data.positions) {
    const parsed = positionSchema.safeParse(raw)
    if (parsed.success) positions.push(parsed.data)
    else droppedPositions += 1
  }
  return { positions, droppedPositions, feedTime: feed.data.time ?? null }
}
