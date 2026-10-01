import { z } from 'zod'
import type { GtfsMode, LineKind } from './types'

/**
 * Zod na wszystkich plikach GTFS PONIŻEJ `stop_times.txt`. `stop_times` (7,95
 * mln wierszy) świadomie omija Zod — patrz nagłówek `schedule.ts`.
 *
 * Wiersze CSV przychodzą jako `Record<nazwaKolumny, wartość>` (składane
 * w `schedule.ts` z nagłówka, nigdy pozycyjnie).
 */
export type GtfsRecord = Record<string, string>

const optional = (value: string | undefined) => (value === undefined || value === '' ? undefined : value)

/**
 * Rodzaj linii — GTFS nie ma takiego pola, wyprowadzamy z numeru linii wg
 * konwencji ZTM: `N…` nocna, `Z…` zastępcza, `E…`/400–599 przyspieszona,
 * 700–899 strefowa (podmiejska), `L…` lokalna, reszta zwykła. `route_desc` (gdy jest) ma pierwszeństwo. Best-effort —
 * kolejne miasto może wymagać innej reguły (wtedy trafi do `CityFeed`).
 */
export function lineKindFrom(shortName: string, desc: string | undefined): LineKind {
  const d = (desc ?? '').toLowerCase()
  if (d.includes('nocn')) return 'night'
  if (d.includes('zastępcz') || d.includes('zastepcz')) return 'replacement'
  if (d.includes('przyspiesz') || d.includes('ekspres')) return 'express'

  const name = shortName.trim()
  if (/^N/i.test(name)) return 'night'
  if (/^Z/i.test(name)) return 'replacement'
  if (/^E/i.test(name)) return 'express'
  const number = Number(name)
  if (Number.isFinite(number) && number >= 400 && number <= 599) return 'express'
  // Warszawa (pomiar 2026-09-30): 7xx i 8xx to zielone linie strefowe/podmiejskie ZTM, `L-1`…`L55` lokalne.
  if (/^L[-\d]/i.test(name)) return 'local'
  if (Number.isFinite(number) && number >= 700 && number <= 899) return 'zone'
  return 'regular'
}

/** Kategoria dnia kursowania — do sekcji rozkładu linii. */
export type ServiceCategory = 'weekday' | 'friday' | 'saturday' | 'sunday' | 'other'

/**
 * Do której kategorii dnia należy `service_id`. Najpierw token w identyfikatorze
 * (konwencja WTP: `…:PcS` roboczy, `PtS` piątek, `SbM` sobota, `NdM` niedziela),
 * potem rozkład dni tygodnia dat kursowania (feed z `calendar.txt` albo bez
 * konwencji w ID). `activeWeekdays` w konwencji `gtfsWeekday`: 0 = pon … 6 = niedz.
 * Kolejne miasto z inną konwencją dokłada tu swój przypadek — jak `lineKindFrom`.
 */
export function serviceCategory(serviceId: string, activeWeekdays: ReadonlySet<number> = new Set()): ServiceCategory {
  const tag = serviceId.replace(/^\d{4}-?\d{2}-?\d{2}:/, '').slice(0, 2).toLowerCase()
  if (tag === 'sb' || tag === 'so') return 'saturday'
  if (tag === 'nd' || tag === 'ni' || tag === 'su') return 'sunday'
  if (tag === 'pt' || tag === 'pi' || tag === 'fr') return 'friday'
  if (tag === 'pc' || tag === 'ro' || tag === 'wd' || tag === 'we') return 'weekday'

  const days = [...activeWeekdays]
  if (days.length > 0) {
    if (days.length === 1 && days[0] === 4) return 'friday'
    if (days.length === 1 && days[0] === 5) return 'saturday'
    if (days.length === 1 && days[0] === 6) return 'sunday'
    if (days.every((d) => d >= 0 && d <= 5)) return 'weekday'
  }
  return 'other'
}

/** `route_type` → garść przypadków, z zakresami rozszerzonymi (HVT). */
export function modeFromRouteType(routeType: number): GtfsMode {
  if (routeType === 0 || (routeType >= 900 && routeType <= 906)) return 'tram'
  if (routeType === 1 || (routeType >= 400 && routeType <= 404)) return 'metro'
  if (routeType === 2 || (routeType >= 100 && routeType <= 117)) return 'rail'
  if (routeType === 3 || routeType === 11 || (routeType >= 700 && routeType <= 716)) return 'bus'
  return 'other'
}

/**
 * `"H+:MM:SS"` (godzina może przekroczyć 24 — sieć nocna) → sekundy od północy
 * doby kursowania. `null` na czymkolwiek innym: w `stop_times` (poza Zod) to
 * jedyny strażnik, wiersz z nierozpoznanym czasem jest odrzucany i liczony.
 */
export function parseGtfsSeconds(value: string): number | null {
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(value)
  if (match === null) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

// --- feed_info.txt ---

export const feedInfoSchema = z
  .object({ feed_version: z.string().optional() })
  .transform((row) => ({ feedVersion: optional(row.feed_version) ?? null }))

// --- routes.txt ---

export const routeSchema = z
  .object({
    route_id: z.string().min(1),
    route_short_name: z.string().optional(),
    route_long_name: z.string().optional(),
    route_desc: z.string().optional(),
    route_type: z.coerce.number().int(),
  })
  .transform((row) => {
    const shortName = optional(row.route_short_name) ?? ''
    return {
      id: row.route_id,
      shortName,
      longName: optional(row.route_long_name) ?? '',
      mode: modeFromRouteType(row.route_type),
      kind: lineKindFrom(shortName, optional(row.route_desc)),
    }
  })

// --- stops.txt ---

export const stopSchema = z
  .object({
    stop_id: z.string().min(1),
    stop_name: z.string().optional(),
    stop_code: z.string().optional(),
    stop_lat: z.coerce.number().optional(),
    stop_lon: z.coerce.number().optional(),
    location_type: z.string().optional(),
    parent_station: z.string().optional(),
    platform_code: z.string().optional(),
    wheelchair_boarding: z.string().optional(),
    street_name: z.string().optional(),
  })
  .transform((row) => {
    const wheelchairRaw = optional(row.wheelchair_boarding)
    const wheelchair = wheelchairRaw === '1' ? 1 : wheelchairRaw === '2' ? 2 : 0
    return {
      id: row.stop_id,
      name: optional(row.stop_name) ?? '',
      /** Numer przystanku w zespole (`stop_code`, np. „01", „06") — do rozróżniania przystanków. */
      code: optional(row.stop_code) ?? null,
      lat: row.stop_lat ?? 0,
      lon: row.stop_lon ?? 0,
      locationType: optional(row.location_type) ?? '0',
      parentId: optional(row.parent_station) ?? null,
      platformCode: optional(row.platform_code) ?? null,
      wheelchair: wheelchair as 0 | 1 | 2,
      /** Ulica, przy której stoi przystanek (`street_name`) — dwie krawędzie zespołu się tak rozróżniają. */
      street: optional(row.street_name) ?? null,
    }
  })

// --- trips.txt ---

export const tripSchema = z
  .object({
    route_id: z.string().min(1),
    service_id: z.string().min(1),
    trip_id: z.string().min(1),
    trip_headsign: z.string().optional(),
    direction_id: z.string().optional(),
    exceptional: z.string().optional(),
    shape_id: z.string().optional(),
  })
  .transform((row) => {
    const headsign = optional(row.trip_headsign) ?? null
    return {
      routeId: row.route_id,
      serviceId: row.service_id,
      tripId: row.trip_id,
      headsign,
      directionId: (row.direction_id === '0' ? 0 : row.direction_id === '1' ? 1 : 2) as 0 | 1 | 2,
      /**
       * Kurs nie reprezentuje linii: `exceptional=1` LUB nagłówek „Zjazd do
       * zajezdni" / „Wyjazd z zajezdni" (konwencja WTP — feed bywa niespójny
       * z flagą `exceptional`, zaobserwowano zjazd z `exceptional=0`).
       */
      exceptional: optional(row.exceptional) === '1' || /zajezdn/i.test(headsign ?? ''),
      shapeId: optional(row.shape_id) ?? null,
    }
  })

// --- calendar.txt / calendar_dates.txt ---

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

/**
 * Data GTFS jako `yyyymmdd`. Spec mówi `YYYYMMDD`, ale przyjmujemy też
 * `YYYY-MM-DD` — `service_id` bywa `2026-09-01:PcS`, a kolejne miasto może mieć
 * odwrotną konwencję (pułapka #4). Normalizujemy do `yyyymmdd`.
 */
const gtfsDate = z
  .string()
  .regex(/^\d{4}-?\d{2}-?\d{2}$/)
  .transform((value) => value.replace(/-/g, ''))

export const calendarSchema = z
  .object({
    service_id: z.string().min(1),
    start_date: gtfsDate,
    end_date: gtfsDate,
    monday: z.string(),
    tuesday: z.string(),
    wednesday: z.string(),
    thursday: z.string(),
    friday: z.string(),
    saturday: z.string(),
    sunday: z.string(),
  })
  .transform((row) => ({
    serviceId: row.service_id,
    startDate: row.start_date,
    endDate: row.end_date,
    days: DAY_KEYS.map((key) => row[key] === '1'),
  }))

export const calendarDateSchema = z
  .object({
    service_id: z.string().min(1),
    date: gtfsDate,
    exception_type: z.enum(['1', '2']),
  })
  .transform((row) => ({
    serviceId: row.service_id,
    date: row.date,
    /** 1 = dodany, 2 = usunięty. */
    added: row.exception_type === '1',
  }))

// --- frequencies.txt ---

export const frequencySchema = z
  .object({
    trip_id: z.string().min(1),
    start_time: z.string(),
    end_time: z.string(),
    headway_secs: z.coerce.number().int(),
    exact_times: z.string().optional(),
  })
  .transform((row) => ({
    tripId: row.trip_id,
    startSec: parseGtfsSeconds(row.start_time),
    endSec: parseGtfsSeconds(row.end_time),
    headwaySecs: row.headway_secs,
  }))

// --- attributions.txt ---

export const attributionSchema = z
  .object({ organization_name: z.string().optional() })
  .transform((row) => optional(row.organization_name) ?? null)

// Schematy vehicles.json / alerts.json żyją przy swoich konsumentach:
// `vehicles.ts` i `alerts.ts`.
