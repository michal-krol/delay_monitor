import { GTFS_TRIP_ID_PATTERN, GTFS_VEHICLE_ID_PATTERN, isGtfsServiceDate } from './validation'

export type VehicleMapSelection = { id: string; tripId: string; serviceDate?: string }

export function vehicleMapHref(city: string, selection: VehicleMapSelection): string {
  const params = new URLSearchParams({ vehicle: selection.id, trip: selection.tripId, ...(selection.serviceDate === undefined ? {} : { date: selection.serviceDate }) })
  return `/city/${city}/map?${params}`
}

/** Deep links only select in-memory feed entities; they never affect upstream requests. */
export function parseVehicleMapSelection(params: { get(name: string): string | null }): VehicleMapSelection | null {
  const id = params.get('vehicle') ?? ''
  const tripId = params.get('trip') ?? ''
  const serviceDate = params.get('date') ?? undefined
  if (!GTFS_VEHICLE_ID_PATTERN.test(id) || !GTFS_TRIP_ID_PATTERN.test(tripId) || (serviceDate !== undefined && !isGtfsServiceDate(serviceDate))) return null
  return { id, tripId, serviceDate }
}
