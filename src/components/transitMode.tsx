import type { GtfsMode, LineKind } from '@/lib/gtfs/types'
import { BusIcon, MetroIcon, OtherModeIcon, TrainIcon, TramIcon } from './icons'

/** Polskie nazwy rodzajów środka — jedno miejsce dla całej warstwy UI komunikacji miejskiej. */
export const MODE_LABEL: Record<GtfsMode, string> = {
  metro: 'metro',
  tram: 'tramwaj',
  bus: 'autobus',
  rail: 'kolej',
  other: 'inne',
}

/** Etykieta rodzaju linii (liczba pojedyncza) — jedno miejsce; pusta = zwykła, bez plakietki. */
export const LINE_KIND_LABEL: Record<LineKind, string> = {
  regular: '',
  night: 'nocna',
  express: 'przyspieszona',
  replacement: 'zastępcza',
  zone: 'podmiejska',
  local: 'lokalna',
}

export const MODE_ICON ={ metro: MetroIcon, tram: TramIcon, bus: BusIcon, rail: TrainIcon, other: OtherModeIcon } as const

/** Kolejność prezentacji rodzajów (metro → tramwaj → autobus → kolej → inne). */
export const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']
