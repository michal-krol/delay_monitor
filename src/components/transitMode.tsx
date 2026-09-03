import type { GtfsMode } from '@/lib/gtfs/types'
import { BusIcon, MetroIcon, TrainIcon, TramIcon } from './icons'

/** Polskie nazwy rodzajów środka — jedno miejsce dla całej warstwy UI komunikacji miejskiej. */
export const MODE_LABEL: Record<GtfsMode, string> = {
  metro: 'metro',
  tram: 'tramwaj',
  bus: 'autobus',
  rail: 'kolej strefowa',
  other: 'inne',
}

export const MODE_ICON = { metro: MetroIcon, tram: TramIcon, bus: BusIcon, rail: TrainIcon, other: BusIcon } as const

/** Kolejność prezentacji rodzajów (metro → tramwaj → autobus → kolej → inne). */
export const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']
