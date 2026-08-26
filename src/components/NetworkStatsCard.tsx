'use client'

import { useState } from 'react'
import { useNetworkStats } from '@/hooks/useNetworkStats'
import type { NetworkStats } from '@/lib/board/networkStats'

const STATUS_COLORS = {
  completed: '#15803d',
  inProgress: '#4f46e5',
  notStarted: '#94a3b8',
  cancelled: '#e11d48',
}

const RING_RADIUS = 15.5
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function formatNumber(value: number): string {
  return value.toLocaleString('pl-PL')
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

/** Segmenty pierścienia stanu sieci — kolejność decyduje o kolejności rysowania (offsety liczone od poprzedniego). */
function statusSegments(stats: NetworkStats): { color: string; length: number; offset: number }[] {
  const total = stats.totalTrains || 1
  const cancelledTotal = stats.cancelled + stats.partialCancelled
  const parts: [string, number][] = [
    [STATUS_COLORS.completed, stats.completed],
    [STATUS_COLORS.inProgress, stats.inProgress],
    [STATUS_COLORS.notStarted, stats.notStarted],
    [STATUS_COLORS.cancelled, cancelledTotal],
  ]
  let offset = 0
  return parts.map(([color, count]) => {
    const length = (count / total) * RING_CIRCUMFERENCE
    const segment = { color, length, offset: -offset }
    offset += length
    return segment
  })
}

/** Prosta linia trendu (bez osi/etykiet) — patrz Faza 3 planu: historia bez dodatkowych zapytań do PLK. */
function Sparkline({ history }: { history: NetworkStats['history'] }) {
  if (history.length < 2) return null
  const width = 100
  const height = 28
  const values = history.map((point) => point.onTimePct)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = history
    .map((point, index) => {
      const x = (index / (history.length - 1)) * width
      const y = height - ((point.onTimePct - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CarrierBars({ carriers }: { carriers: NetworkStats['topCarriers'] }) {
  if (carriers.length === 0) return null
  const max = carriers[0].count
  return (
    <div className="flex flex-col gap-1.5">
      {carriers.map((carrier) => (
        <div key={carrier.code} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-foreground">{carrier.name ?? carrier.code}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(carrier.count / max) * 100}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right text-xs text-text-muted">{formatNumber(carrier.count)}</span>
        </div>
      ))}
    </div>
  )
}

export function NetworkStatsCard() {
  const { data, error } = useNetworkStats()
  const [expanded, setExpanded] = useState(false)

  if (error !== null && data === null) return null // brak jeszcze żadnych danych i błąd -- widżet poboczny, nie warto pokazywać komunikatu o błędzie

  return (
    <div className="glass rounded-2xl p-4">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 text-left"
      >
        <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
          <circle cx={18} cy={18} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth={4} className="text-black/10 dark:text-white/10" />
          {data !== null && (
            <circle
              cx={18}
              cy={18}
              r={RING_RADIUS}
              fill="none"
              stroke={STATUS_COLORS.completed}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${(data.onTimePct / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              transform="rotate(-90 18 18)"
            />
          )}
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Dziś w Polsce</p>
          <p className="truncate text-xs text-text-secondary">
            {data === null ? 'Wczytywanie…' : `${formatNumber(data.totalTrains)} pociągów · zgodnie z planem`}
          </p>
        </div>
        {data !== null && <span className="shrink-0 text-xs text-text-muted">{formatTime(data.generatedAt)}</span>}
        <svg
          width={16}
          height={16}
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={`shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && data !== null && (
        <div className="mt-3.5 flex flex-col gap-4 border-t border-black/10 pt-3.5 dark:border-white/10">
          <div className="flex items-center gap-4">
            <svg width={80} height={80} viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
              {statusSegments(data).map((segment, index) => (
                <circle
                  key={index}
                  cx={18}
                  cy={18}
                  r={RING_RADIUS}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={5}
                  strokeDasharray={`${segment.length} ${RING_CIRCUMFERENCE - segment.length}`}
                  strokeDashoffset={segment.offset}
                  transform="rotate(-90 18 18)"
                />
              ))}
            </svg>
            <dl className="grid grid-cols-1 gap-1 text-xs text-text-secondary">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS.completed }} />
                Zakończone · {formatNumber(data.completed)}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS.inProgress }} />
                W trasie · {formatNumber(data.inProgress)}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS.notStarted }} />
                Jeszcze nie wyruszyły · {formatNumber(data.notStarted)}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS.cancelled }} />
                Odwołane · {formatNumber(data.cancelled)}
                {data.partialCancelled > 0 && <span className="text-text-muted"> (+{formatNumber(data.partialCancelled)} częściowo)</span>}
              </div>
            </dl>
          </div>

          {data.topCarriers.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-text-muted">Najwięcej pociągów dziś</p>
              <CarrierBars carriers={data.topCarriers} />
            </div>
          )}

          {data.history.length >= 2 && (
            <div>
              <p className="mb-1 text-xs text-text-muted">Trend &bdquo;zgodnie z planem&rdquo; dziś</p>
              <Sparkline history={data.history} />
            </div>
          )}

          <p className="text-xs text-text-secondary">
            {formatNumber(data.disruptionCount)} zgłoszonych utrudnień na sieci
          </p>
        </div>
      )}
    </div>
  )
}
