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

export const MODE_ICON = { metro: MetroIcon, tram: TramIcon, bus: BusIcon, rail: TrainIcon, other: OtherModeIcon } as const

export type LineColor = { bg: string; fg: string }

/**
 * JEDNA paleta kategorii linii (decyzja właściciela) — plakietki, mapa, legenda. Kolor = kategoria,
 * nie `route_color` z feedu i nigdy nie status (#13: autobus nie może czytać się jak „na czas” —
 * pilnuje tego `transitMode.test.ts`). Metro żółte z ciemnoczerwonym tekstem, reszta biały tekst.
 */
export const LINE_PALETTE = {
  metro: { bg: '#f8d958', fg: '#9f1216' },
  tram: { bg: '#0e7490', fg: '#ffffff' },
  rail: { bg: '#2563eb', fg: '#ffffff' },
  bus: { bg: '#880077', fg: '#ffffff' },
  express: { bg: '#b60000', fg: '#ffffff' },
  zone: { bg: '#006800', fg: '#ffffff' },
  local: { bg: '#000088', fg: '#ffffff' },
  night: { bg: '#000000', fg: '#ffffff' },
  replacement: { bg: '#57534e', fg: '#ffffff' },
  other: { bg: '#6b7280', fg: '#ffffff' },
} as const satisfies Record<string, LineColor>

/**
 * Kolor linii: tramwaj i autobus wg rodzaju linii (nocna, przyspieszona…), zwykła = kolor rodzaju środka;
 * metro, kolej i „inne” zawsze po rodzaju (nie mają linii nocnych/strefowych).
 */
export function lineColor(mode: GtfsMode, kind: LineKind): LineColor {
  return (mode === 'bus' || mode === 'tram') && kind !== 'regular' ? LINE_PALETTE[kind] : LINE_PALETTE[mode]
}

/**
 * Czerń (nocna) i granat (lokalna) giną na ciemnym tle — w trybie ciemnym dostają jasny pierścień.
 * Jedna reguła dla plakietki i próbki koloru w legendzie podsekcji.
 */
export function darkRingClass(kind: LineKind): string {
  return kind === 'night' || kind === 'local' ? 'dark:ring-1 dark:ring-white/40' : ''
}

/** Kolejność prezentacji rodzajów (metro → tramwaj → autobus → kolej → inne). */
export const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']
