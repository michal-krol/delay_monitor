export type Station = {
  id: string
  name: string
}

export type RawStop = {
  plannedArrival: string | null
  actualArrival: string | null
  plannedDeparture: string | null
  actualDeparture: string | null
  delayMinutes: number | null
  cancelled: boolean
  platform: string | null
}

export type RawOperation = {
  stationId: string
  trainNumber: string
  carrier: string
  category: string
  originStationName: string
  destinationStationName: string
  stop: RawStop
}
