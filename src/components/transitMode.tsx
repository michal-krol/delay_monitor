import type { GtfsMode, LineKind } from '@/lib/gtfs/types'
import { BusIcon, ICON_SIZE, MetroIcon, OtherModeIcon, StopIcon, TrainIcon, TramIcon } from './icons'

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

/**
 * Rodzaje autobusów = legenda kolorów ZTM (podsekcje strony „Linie”, legenda mapy). Liczba mnoga;
 * zakresy numerów to objaśnienie dla pasażera — reguła przydziału żyje w `lineKindFrom` (`lib/gtfs/schema.ts`).
 */
export const BUS_KIND_ORDER: LineKind[] = ['regular', 'express', 'zone', 'local', 'night', 'replacement']
export const BUS_KIND_LABEL: Record<LineKind, string> = {
  regular: 'zwykłe',
  express: 'przyspieszone',
  zone: 'podmiejskie (7xx, 8xx)',
  local: 'lokalne (L)',
  night: 'nocne (N)',
  replacement: 'zastępcze (Z)',
}

export const MODE_ICON = { metro: MetroIcon, tram: TramIcon, bus: BusIcon, rail: TrainIcon, other: OtherModeIcon } as const

/** Rzeczownik rodzaju w liczbie pojedynczej, małą literą; GTFS rail to „kolej miejska”, nigdy słownictwo PKP (#13). */
const modeNoun = (mode: GtfsMode): string => (mode === 'rail' ? 'kolej miejska' : MODE_LABEL[mode])
const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Rodzaj z wielkiej litery do podpisów miejsc i wyników. */
export const modeKindLabel = (mode: GtfsMode): string => capitalise(modeNoun(mode))

/** „Tramwaj, autobus” — rodzaje miejsca w jednym podpisie; pusty, gdy rodzajów (jeszcze) nie znamy. */
export const modesLabel = (modes: readonly GtfsMode[]): string => capitalise(modes.map(modeNoun).join(', '))

/**
 * Dekoracyjne ikony trybów (obok widocznego tekstu) — jedyne miejsce, gdzie lista trybów zamienia się w glify.
 * Bez znanych trybów (ładowanie, stary wpis) — neutralny znak przystanku, nigdy domyślny autobus.
 */
export function ModeGlyphs({ modes, size = ICON_SIZE.tile, className }: { modes: readonly GtfsMode[]; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`.trim()}>
      {modes.length === 0 ? (
        <span data-testid="stop-glyph" className="inline-flex">
          <StopIcon size={size} />
        </span>
      ) : (
        modes.map((mode) => {
          const Icon = MODE_ICON[mode]
          return (
            <span key={mode} data-testid="mode-glyph" data-mode={mode} className="inline-flex">
              <Icon size={size} />
            </span>
          )
        })
      )}
    </span>
  )
}

/** Kafelek z ikonami rodzajów (wynik wyszukiwania, karta miejsca). */
export function ModeTile({ modes }: { modes: readonly GtfsMode[] }) {
  return (
    <span className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-xl bg-primary-soft px-1.5 text-primary-text">
      <ModeGlyphs modes={modes} />
    </span>
  )
}

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
