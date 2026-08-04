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
  /** Prawdziwy identyfikator konkretnego przejazdu — patrz `RawRoute.trainOrderId`. */
  trainOrderId: string | null
  /** S=NotStarted, P=InProgress, C=Completed, X=Cancelled, Q=PartialCancelled. */
  trainStatus: string | null
  stations: RawOperationStation[]
}

export type RawRouteStop = {
  stationId: string
  arrivalPlatform: string | null
  arrivalTrack: string | null
  departurePlatform: string | null
  departureTrack: string | null
}

export type RawRoute = {
  scheduleId: string
  orderId: string
  /**
   * Identyfikator konkretnego przejazdu — wypełniany przez API tylko gdy
   * różni się od `orderId` (np. gdy ten sam wzorzec trasy realizuje kilka
   * odrębnych pociągów). Klucz łączący z `/operations` musi go preferować
   * nad `orderId`, patrz `routeKey()` w `board/transform.ts`.
   */
  trainOrderId: string | null
  carrierCode: string | null
  commercialCategorySymbol: string | null
  name: string | null
  nationalNumber: string | null
  stations: RawRouteStop[]
}
