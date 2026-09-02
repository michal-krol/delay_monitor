'use client'

import { useMemo, useState } from 'react'
import { favouriteKey, useFavourites, type Favourite } from '@/hooks/useFavourites'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { useShareUrl } from '@/hooks/useShareUrl'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { GtfsLine } from '@/lib/gtfs/query'
import { AttributionFooter } from './AttributionFooter'
import { AsideCard, HourlyTraffic } from './aside'
import { LineBadge } from './LineBadge'
import { ScheduleStatus } from './ScheduleStatus'
import { TransitDepartureList } from './TransitDepartureList'
import { ShareIcon, StarIcon } from './icons'

const MODE_LABEL: Record<GtfsMode, string> = {
  metro: 'metro',
  tram: 'tramwaj',
  bus: 'autobus',
  rail: 'kolej strefowa',
  other: 'inne',
}
const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']

/** `sec` może przekroczyć 86400 (kurs po północy) — zwijamy do zegara doby. */
function clockOfSec(sec: number): string {
  const h = Math.floor(sec / 3600) % 24
  const m = Math.floor(sec / 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-foreground">{value}</div>
      {hint !== undefined && <div className="text-xs text-text-secondary">{hint}</div>}
    </div>
  )
}

/**
 * Szczegóły przystanku miejskiego — wzorem `FullBoard`, ale bez opóźnień
 * (komunikacja miejska ich nie ma: „rozkład", nigdy „na czas"). Wspólny
 * komponent dla samodzielnej trasy i osadzenia na ekranie miasta.
 */
export function TransitStopDetail({ city, stopId, embedded = false }: { city: string; stopId: string; embedded?: boolean }) {
  const { data, error } = useTransitBoard(city, [stopId])
  const { isFavourite, addFavourite, removeFavourite } = useFavourites()
  const { share, status: shareStatus } = useShareUrl()
  const now = useSnapshotNow(data)
  const [lineFilter, setLineFilter] = useState<string | null>(null)

  const board = data?.stops[0] ?? null
  const stopName = board?.name ?? stopId
  const favourite: Favourite = { kind: 'gtfs', city, id: stopId, name: stopName }
  const key = favouriteKey(favourite)
  const pinned = isFavourite(key)
  const loading = data === null && error === null

  const departures = useMemo(
    () => (lineFilter === null ? (board?.departures ?? []) : (board?.departures ?? []).filter((d) => d.routeId === lineFilter)),
    [board, lineFilter]
  )

  const linesByMode = useMemo(() => {
    const groups = new Map<GtfsMode, GtfsLine[]>()
    for (const line of board?.lines ?? []) {
      const list = groups.get(line.mode) ?? []
      list.push(line)
      groups.set(line.mode, list)
    }
    return MODE_ORDER.filter((mode) => groups.has(mode)).map((mode) => [mode, groups.get(mode)!] as const)
  }, [board])

  const summary = board?.summary

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{stopName}</h1>
              {board !== null && board.modes.length > 0 && (
                <p className="mt-1 text-sm text-text-secondary">
                  {board.modes.map((mode) => MODE_LABEL[mode]).join(' · ')}
                </p>
              )}
              {data !== null && (
                <div className="mt-2">
                  <ScheduleStatus schedule={data.schedule} cityName={city} error={error !== null} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {shareStatus !== 'idle' && (
                <span role="status" className="text-sm text-text-secondary">
                  {shareStatus === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować'}
                </span>
              )}
              {!embedded && (
                <button
                  type="button"
                  onClick={() => void share()}
                  className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <ShareIcon size={15} />
                  Udostępnij
                </button>
              )}
              <button
                type="button"
                onClick={() => (pinned ? removeFavourite(key) : addFavourite(favourite))}
                aria-label={pinned ? 'Odepnij z Pulpitu' : 'Przypnij do Pulpitu'}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
                style={{ borderColor: 'var(--surface-border)' }}
              >
                <StarIcon size={15} className={pinned ? 'fill-current text-amber-400' : ''} />
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Linie" value={summary ? String(summary.lineCount) : '—'} />
          <SummaryCard label="Odjazdy dziś" value={summary ? String(summary.departuresToday) : '—'} hint="wg rozkładu" />
          <SummaryCard
            label="Rodzaje"
            value={board !== null && board.modes.length > 0 ? String(board.modes.length) : '—'}
            hint={board?.modes.map((mode) => MODE_LABEL[mode]).join(', ')}
          />
          <SummaryCard
            label="Pierwszy / ostatni"
            value={
              summary && summary.firstDepartureSec !== null && summary.lastDepartureSec !== null
                ? `${clockOfSec(summary.firstDepartureSec)}–${clockOfSec(summary.lastDepartureSec)}`
                : '—'
            }
          />
        </div>

        <section className="glass rounded-2xl p-5">
          {board !== null && board.lines.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLineFilter(null)}
                aria-pressed={lineFilter === null}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  lineFilter === null ? 'text-white' : 'text-text-secondary'
                }`}
                style={lineFilter === null ? { background: 'var(--accent-gradient)', borderColor: 'transparent' } : { borderColor: 'var(--surface-border)' }}
              >
                Wszystkie linie
              </button>
              {board.lines.map((line) => (
                <button
                  key={line.routeId}
                  type="button"
                  onClick={() => setLineFilter(lineFilter === line.routeId ? null : line.routeId)}
                  aria-pressed={lineFilter === line.routeId}
                  className="rounded-full"
                >
                  <span style={{ opacity: lineFilter !== null && lineFilter !== line.routeId ? 0.4 : 1 }}>
                    <LineBadge line={line.line} color={line.color} mode={line.mode} size="sm" />
                  </span>
                </button>
              ))}
            </div>
          )}

          <TransitDepartureList departures={departures} loading={loading} />
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <AsideCard title="Natężenie ruchu dziś">
          <HourlyTraffic
            hourly={summary?.hourly ?? null}
            loading={loading}
            currentHour={new Date(now).getHours()}
            emptyLabel="Rozkład na dziś nie zawiera odjazdów z tego przystanku."
          />
        </AsideCard>

        <AsideCard title="Linie na tym przystanku">
          {linesByMode.length === 0 ? (
            <p className="text-xs text-text-muted">—</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {linesByMode.map(([mode, lines]) => (
                <div key={mode}>
                  <div className="mb-1 text-xs text-text-muted">{MODE_LABEL[mode]}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {lines.map((line) => (
                      <LineBadge key={line.routeId} line={line.line} color={line.color} mode={line.mode} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AsideCard>

        <AttributionFooter attribution={data?.attribution ?? []} />
      </aside>
    </div>
  )
}
