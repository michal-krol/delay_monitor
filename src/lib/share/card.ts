import { getCity } from '@/lib/gtfs/cities'
import { stopGroup } from '@/lib/gtfs/query'
import type { GtfsMode, GtfsSchedule } from '@/lib/gtfs/types'
import { APP_NAME } from '@/lib/siteMeta'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN, GTFS_STOP_ID_PATTERN, STATION_ID_PATTERN, decodeStopIdFromPathSegment } from '@/lib/validation'

/**
 * Karta podglądu linku. Powstaje WYŁĄCZNIE z parametrów trasy i naszych własnych danych (słownik
 * stacji, rozkład GTFS) — nigdy z `?name=` ani innego tekstu z URL-a (AGENTS.md #4): spreparowany
 * link nie może wstawić dowolnego napisu na naszą kartę. Nieznany/nieprawidłowy id → `generic`.
 */
export type ShareCard =
  | { kind: 'generic' }
  | { kind: 'place'; label: 'Stacja kolejowa' | 'Przystanek' | 'Linia'; title: string; detail: string | null; mode: GtfsMode; city: string | null }

export type ShareLookups = {
  railStationName(id: string): Promise<string | null>
  /** Rozkład miasta, jeśli już wczytany — nigdy nie wybudza pollera (robot to nie widz). */
  schedule(cityId: string): GtfsSchedule | null
}

const GENERIC: ShareCard = { kind: 'generic' }
const MAX_TEXT = 80

const clamp = (text: string): string => text.slice(0, MAX_TEXT)

export async function resolveRailCard(stationId: string, lookups: ShareLookups): Promise<ShareCard> {
  if (!STATION_ID_PATTERN.test(stationId)) return GENERIC
  try {
    const name = await lookups.railStationName(stationId)
    if (name === null) return GENERIC
    return { kind: 'place', label: 'Stacja kolejowa', title: clamp(name), detail: null, mode: 'rail', city: null }
  } catch {
    return GENERIC
  }
}

/** Rozkład miasta z rejestru (`city` wybiera feed) albo `null`; zwraca też nazwę miasta do karty. */
function cityAndSchedule(city: string, lookups: ShareLookups): { name: string; schedule: GtfsSchedule } | null {
  if (!CITY_ID_PATTERN.test(city)) return null
  const entry = getCity(city)
  if (entry === null) return null
  const schedule = lookups.schedule(city)
  return schedule === null ? null : { name: entry.name, schedule }
}

export async function resolveStopCard(city: string, stopSegment: string, lookups: ShareLookups): Promise<ShareCard> {
  const stopId = decodeStopIdFromPathSegment(stopSegment)
  if (!GTFS_STOP_ID_PATTERN.test(stopId)) return GENERIC
  const found = cityAndSchedule(city, lookups)
  if (found === null) return GENERIC
  const group = stopGroup(found.schedule, stopId)
  if (group === null) return GENERIC
  return { kind: 'place', label: 'Przystanek', title: clamp(group.name), detail: null, mode: group.modes[0] ?? 'other', city: found.name }
}

export async function resolveLineCard(city: string, routeId: string, lookups: ShareLookups): Promise<ShareCard> {
  if (!GTFS_ROUTE_ID_PATTERN.test(routeId)) return GENERIC
  const found = cityAndSchedule(city, lookups)
  if (found === null) return GENERIC
  const routeIdx = found.schedule.routeIndexById.get(routeId)
  const route = routeIdx === undefined ? undefined : found.schedule.routes[routeIdx]
  if (route === undefined) return GENERIC
  const line = route.shortName || route.longName || route.id
  const detail = route.longName !== '' && route.longName !== line ? clamp(route.longName) : null
  return { kind: 'place', label: 'Linia', title: clamp(line), detail, mode: route.mode, city: found.name }
}

/** Tytuł strony/podglądu; `null` = zostaje tytuł z root layoutu. */
export function shareTitle(card: ShareCard): string | null {
  return card.kind === 'place' ? `${card.title} — ${APP_NAME}` : null
}
