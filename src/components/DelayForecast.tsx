import { STATUS_TEXT } from './DelayBadge'
import type { DelayPoint } from '@/lib/board/journey'
import type { RealizationStatus } from '@/lib/board/realization'

type Props = {
  series: DelayPoint[]
  /** Godzina przyjazdu do celu (już sformatowana) — `null`, gdy nieznana. */
  arrivalTime: string | null
  arrivalStatus: RealizationStatus
  className?: string
}

// Geometria w jednostkach viewBoksa; SVG skaluje się do szerokości kolumny.
const W = 300
const H = 132
const PAD = { top: 12, right: 10, bottom: 24, left: 30 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

/** Minimalna górna granica osi, żeby pociąg punktualny nie dostał wykresu bez żadnej skali. */
const MIN_TOP_MINUTES = 5

type Placed = DelayPoint & { x: number; y: number | null }

function formatSigned(minutes: number): string {
  return minutes > 0 ? `+${minutes} min` : minutes < 0 ? `${minutes} min` : 'na czas'
}

/**
 * Łamana z przerwami: punkt bez znanego opóźnienia (`delayMinutes === null`)
 * NIE jest zerem — przerywa linię, zamiast ciągnąć ją przez „na czas".
 * Rysowanie go jako 0 byłoby zmyśleniem faktu (AGENTS.md #2).
 */
function segments(points: Placed[]): Placed[][] {
  const result: Placed[][] = []
  let current: Placed[] = []
  for (const point of points) {
    if (point.y === null) {
      if (current.length > 0) result.push(current)
      current = []
      continue
    }
    current.push(point)
  }
  if (current.length > 0) result.push(current)
  return result
}

function toPath(segment: Placed[]): string {
  return segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${(point.y as number).toFixed(1)}`).join(' ')
}

/**
 * Opóźnienie wzdłuż trasy: fakt linią ciągłą, prognoza przerywaną.
 *
 * Rozróżnienie fakt/prognoza jest niesione przez KSZTAŁT linii, nie przez sam
 * kolor — kolor mówi tylko o statusie i jest ten sam po obu stronach granicy.
 * Dzięki temu informacja „to już się wydarzyło" przechodzi też do osoby
 * nierozróżniającej kolorów i do wydruku.
 *
 * Odpowiednikiem widoku tabelarycznego jest lista przystanków obok — te same
 * liczby, przystanek po przystanku — więc wykres nie jest jedynym nośnikiem
 * żadnej informacji.
 */
export function DelayForecast({ series, arrivalTime, arrivalStatus, className }: Props) {
  const known = series.filter((point) => point.delayMinutes !== null).map((point) => point.delayMinutes as number)

  if (series.length < 2 || known.length === 0) {
    return (
      <p className={`text-sm text-text-secondary ${className ?? ''}`}>
        Za mało danych, żeby pokazać przebieg opóźnienia. Pojawi się, gdy pociąg minie pierwsze przystanki.
      </p>
    )
  }

  const top = Math.max(MIN_TOP_MINUTES, ...known)
  const bottom = Math.min(0, ...known)
  const span = top - bottom || 1
  const yFor = (minutes: number) => PAD.top + PLOT_H - ((minutes - bottom) / span) * PLOT_H
  const xFor = (index: number) => PAD.left + (series.length === 1 ? 0 : (index / (series.length - 1)) * PLOT_W)

  const placed: Placed[] = series.map((point, index) => ({
    ...point,
    x: xFor(index),
    y: point.delayMinutes === null ? null : yFor(point.delayMinutes),
  }))

  const facts = segments(placed.filter((point) => point.kind === 'fact'))
  // Prognoza startuje od OSTATNIEGO faktu, żeby linia się nie urwała w
  // powietrzu — granica jest widoczna przez zmianę kreski, nie przez dziurę.
  const lastFactIndex = placed.reduce((last, point, index) => (point.kind === 'fact' && point.y !== null ? index : last), -1)
  const projection = segments(placed.slice(Math.max(lastFactIndex, 0)).filter((point) => point.kind === 'projection' || point.y !== null))
  const hasProjection = placed.some((point) => point.kind === 'projection' && point.y !== null)

  const lineColor = STATUS_TEXT[arrivalStatus]
  const baselineY = yFor(0)
  const lastKnown = [...placed].reverse().find((point) => point.y !== null)

  const summary = `Opóźnienie wzdłuż trasy, ${series.length} przystanków. ${series
    .filter((point) => point.delayMinutes !== null)
    .map((point) => `${point.stationName}: ${formatSigned(point.delayMinutes as number)}${point.kind === 'projection' ? ' (prognoza)' : ''}`)
    .join('; ')}.`

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[260px]" role="img" aria-label={summary}>
          {/* Siatka wycofana: dwie linie odniesienia, nie krata. */}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={baselineY}
            y2={baselineY}
            stroke="var(--surface-border)"
            strokeWidth={1}
          />
          <text x={PAD.left - 6} y={baselineY + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
            0
          </text>
          <text x={PAD.left - 6} y={yFor(top) + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
            +{top}
          </text>

          {facts.map((segment, index) => (
            <path
              key={`fact-${index}`}
              d={toPath(segment)}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {projection.map((segment, index) => (
            <path
              key={`projection-${index}`}
              d={toPath(segment)}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeOpacity={0.75}
            />
          ))}

          {placed.map((point) =>
            point.y === null ? null : (
              <circle
                key={point.stationName + point.x}
                cx={point.x}
                cy={point.y}
                r={point.kind === 'fact' ? 3 : 2.5}
                fill={point.kind === 'fact' ? lineColor : 'var(--surface-strong)'}
                stroke={lineColor}
                strokeWidth={point.kind === 'fact' ? 0 : 1.5}
              >
                <title>{`${point.stationName}: ${formatSigned(point.delayMinutes as number)}${point.kind === 'projection' ? ' (prognoza)' : ''}`}</title>
              </circle>
            )
          )}

          {/* Podpisy tylko na krańcach — liczba przy każdym punkcie zamieniłaby
              wykres w gorzej ułożoną tabelę, którą i tak mamy obok. */}
          <text x={PAD.left} y={H - 8} textAnchor="start" fontSize={9} fill="var(--text-muted)">
            {series[0].stationName.slice(0, 14)}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={9} fill="var(--text-muted)">
            {series[series.length - 1].stationName.slice(0, 14)}
          </text>
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="16" y2="3" stroke={lineColor} strokeWidth={2} strokeLinecap="round" />
            </svg>
            fakt
          </span>
          {hasProjection && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="16"
                  y2="3"
                  stroke={lineColor}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  strokeOpacity={0.75}
                  strokeLinecap="round"
                />
              </svg>
              prognoza
            </span>
          )}
        </div>

        {arrivalTime !== null && (
          <div
            className="rounded-lg border px-2.5 py-1 text-right"
            style={{ borderColor: 'color-mix(in srgb, currentColor 25%, transparent)', color: lineColor }}
          >
            <div className="text-[10px] tracking-[0.08em] text-text-muted uppercase">Przyjazd</div>
            <div className="text-sm font-bold tabular-nums">{arrivalTime}</div>
          </div>
        )}
      </div>

      {lastKnown !== undefined && lastKnown.kind === 'projection' && (
        <p className="mt-2 text-xs text-text-secondary">
          Wartości po ostatnim potwierdzonym przystanku to prognoza z jego opóźnienia, nie pomiar.
        </p>
      )}
    </div>
  )
}
