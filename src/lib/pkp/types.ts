export type Station = {
  id: string
  name: string
}

export type RawOperationStation = {
  stationId: string
  plannedArrival: string | null
  plannedDeparture: string | null
  actualArrival: string | null
  actualDeparture: string | null
  arrivalDelayMinutes: number | null
  departureDelayMinutes: number | null
  isCancelled: boolean
}

export type RawTrainOperation = {
  scheduleId: string
  orderId: string
  stations: RawOperationStation[]
}

export type RawRoute = {
  scheduleId: string
  orderId: string
  carrierCode: string | null
  commercialCategorySymbol: string | null
  name: string | null
  nationalNumber: string | null
}
