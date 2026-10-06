import { peekGtfsPoller } from '@/lib/gtfs/instance'
import { getStationName } from '@/lib/weather/coordinates'
import type { ShareLookups } from './card'

/**
 * Jedyne źródła nazw na kartach podglądu: statyczny słownik stacji i już wczytany rozkład GTFS.
 * Celowo bez `board/instance` i `pkp/client` (zero zapytań do PKP, #3) oraz bez `getGtfsPoller`
 * (nie wybudza pollerów — robot podglądu to nie widz).
 */
export const liveLookups: ShareLookups = {
  railStationName: getStationName,
  schedule: (cityId) => peekGtfsPoller(cityId)?.getSchedule() ?? null,
}
