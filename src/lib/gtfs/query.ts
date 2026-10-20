/**
 * Odczyt rozkładu w pamięci — fasada. Definicje leżą w modułach po zadaniach;
 * ten plik tylko je re-eksportuje, żeby importerzy (`@/lib/gtfs/query`) się nie zmieniali.
 * Czysty — bierze `GtfsSchedule`, zwraca zwykłe obiekty. Zero pola opóźnienia ani „czasu faktycznego".
 */
export { groupIdOf, nextDepartures } from './departures'
export type { GtfsLine, StopGroup, StopGroupMember, StopSearchResult, StopSummary } from './stopGroups'
export { groupLines, searchStops, stopGroup, stopSummary } from './stopGroups'
export type { LineDepartureBlock, LineDetail, LineListEntry, LineRouteDirection, LineRouteStop } from './lines'
export { allLines, lineDetail, linesByMode, SERVICE_CATEGORIES } from './lines'
export type { CityStats } from './cityStats'
export { cityStats } from './cityStats'
export { alertsForRoutes, vehicleForStop, vehiclesInService } from './liveOverlay'
export type { BackboneLine, CityStop } from './cityMap'
export { backboneLines, cityStops, groupCentroid } from './cityMap'
