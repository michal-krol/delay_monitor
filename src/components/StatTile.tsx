import type { ReactNode } from 'react'
import { parseDisplayNumber } from '@/lib/displayNumber'
import { AnimatedNumber } from './AnimatedNumber'

type Props = {
  /** Bez ikony (podsumowanie przystanku) kafelek nie rezerwuje na nią miejsca. */
  icon?: ReactNode
  /** Kolor akcentu ikony — token statusu, nie własny hex (patrz `globals.css`). */
  accent?: string
  label: string
  value: string
  unit?: string
  hint?: string
  /** W pigułce bez jednostki — „Odjazdy dzisiaj 2” mówi wszystko, a dwa rzędy pigułek zamiast trzech. */
  hideUnitInPill?: boolean
  /** Etykieta kafelka WIELKIMI LITERAMI (podsumowanie przystanku); w pigułce zawsze zwykła. */
  uppercaseLabel?: boolean
  /** `false` — zawsze kafelek (arkusz „Info”, gdzie jest miejsce na podpis metody). */
  pills?: boolean
  className?: string
}

/**
 * Jedna karta KPI w dwóch kształtach, bez drugiej kopii w DOM: poniżej `sm` zwarty kafelek (liczba nad etykietą,
 * bez ikony i podpisu; cztery równe w rzędzie), żeby pierwszy odjazd mieścił się na ekranie; od `sm` kafelek. Używa jej
 * `StationStatsCards` (stacja) i podsumowanie przystanku (`TransitStopDetail`).
 */
export function StatTile({ icon, accent, label, value, unit, hint, hideUnitInPill = false, uppercaseLabel = false, pills = true, className = '' }: Props) {
  // Tylko cyfry się toczą; „brak danych” i „—” zostają tekstem, więc nieznane nigdy nie staje się „0” (#7).
  const number = parseDisplayNumber(value)
  return (
    <div data-testid="stat-tile" className={`glass flex items-start gap-3 rounded-2xl p-4 ${pills ? 'max-sm:justify-center max-sm:gap-1.5 max-sm:rounded-2xl max-sm:p-1 max-sm:text-center' : ''} ${className}`.trim()}>
      {icon !== undefined && (
        <span
          data-testid="stat-tile-icon"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${pills ? 'max-sm:hidden' : ''}`}
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className={`min-w-0 ${pills ? 'max-sm:flex max-sm:flex-col-reverse max-sm:items-center' : ''}`}>
        <span className={`block text-xs font-medium text-text-muted ${pills ? 'max-sm:leading-tight' : ''} ${uppercaseLabel ? 'uppercase tracking-wide max-sm:normal-case max-sm:tracking-normal' : ''}`}>{label} </span>
        <span className="block">
          <span className={`font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums ${pills ? 'max-sm:text-lg' : ''} ${pills && number === null ? 'max-sm:text-xs max-sm:leading-6' : ''}`}>{number === null ? value : <AnimatedNumber prefix={number.prefix} value={number.value} suffix={number.suffix} />}</span>
          {/* Spacja jest znakiem treści, nie tylko odstępem: `ml-1` daje
              margines wizualny, ale czytnik ekranu przeczytałby „2pociągi". */}
          {unit !== undefined && <span className={`ml-1 text-sm text-text-secondary ${pills ? (hideUnitInPill ? 'max-sm:hidden' : 'max-sm:text-xs') : ''}`}> {unit}</span>}
        </span>
        {hint !== undefined && <span className={`block text-xs ${uppercaseLabel ? 'text-text-secondary' : 'text-text-muted'} ${pills ? 'max-sm:hidden' : ''}`}>{hint}</span>}
      </span>
    </div>
  )
}
