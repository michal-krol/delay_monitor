'use client'

import { useEffect, useMemo, useState } from 'react'
import { favouriteKey, useFavourites, type Favourite } from '@/hooks/useFavourites'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { useShareUrl } from '@/hooks/useShareUrl'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { GtfsLine, StopGroupMember } from '@/lib/gtfs/query'
import { AttributionFooter } from './AttributionFooter'
import { AsideCard, HourlyTraffic } from './aside'
import { CityWeatherCard } from './CityWeatherCard'
import { LineBadge } from './LineBadge'
import { ScheduleStatus } from './ScheduleStatus'
import { TransitDepartureList } from './TransitDepartureList'
import { MODE_LABEL, MODE_ORDER } from './transitMode'
import { AccessibleIcon, ShareIcon, StarIcon } from './icons'

/** Numer słupka do plakietki: `stop_code` („07"), inaczej peron, inaczej „—". */
function slupekNumber(member: StopGroupMember): string {
  return member.code ?? member.platformCode ?? '—'
}

const LINE_KIND_LABEL = { regular: '', night: 'nocna', express: 'przyspieszona', replacement: 'zastępcza' } as const

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
export function TransitStopDetail({
  city,
  stopId,
  embedded = false,
  initialName,
}: {
  city: string
  stopId: string
  embedded?: boolean
  /** Nazwa z linku (`?nazwa=`) — nagłówek do czasu wczytania rozkładu, potem tablica ją nadpisuje. */
  initialName?: string
}) {
  // `undefined` = jeszcze nie wybrano (idź za słupkiem z deep-linku),
  // `null` = user jawnie wybrał cały zespół, `string` = wybrany słupek.
  const [slupekChoice, setSlupekChoice] = useState<string | null | undefined>(undefined)
  const [lineFilter, setLineFilter] = useState<string | null>(null)
  const [requestedMember, setRequestedMember] = useState<string | null>(null)
  // Reset przy zmianie przystanku — ten sam idiom co useTransitBoard.ts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlupekChoice(undefined)
    setRequestedMember(null)
  }, [stopId])
  // Efektywny słupek: jawny wybór usera, inaczej słupek z deep-linku (echo serwera).
  const effSlupek = slupekChoice === undefined ? requestedMember : slupekChoice
  const { data, error } = useTransitBoard(city, [stopId], 20, effSlupek)
  const { isFavourite, addFavourite, removeFavourite } = useFavourites()
  const { share, status: shareStatus } = useShareUrl()
  const now = useSnapshotNow(data)

  const board = data?.stops[0] ?? null
  // Po pierwszej odpowiedzi zapamiętaj, czy pytano wprost o słupek (deep-link z trasy linii).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (board?.requestedMember != null) setRequestedMember(board.requestedMember)
  }, [board?.requestedMember])
  // Pomijamy „słupki" bez linii (stacje-rodzice metra, np. 7014M) — nie da się
  // z nich odjechać, tylko zaśmiecają przełącznik.
  const members = (board?.members ?? []).filter((m) => m.lines.length > 0)
  const activeMember = effSlupek !== null ? members.find((m) => m.id === effSlupek) ?? null : null
  const stopName = board?.name ?? initialName ?? stopId
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
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{stopName}</h1>
                {board?.wheelchairNote != null && (
                  <span
                    title={
                      board.wheelchairNote === 'inaccessible'
                        ? 'Przystanek niedostępny dla osób poruszających się na wózku'
                        : 'Część słupków tego przystanku niedostępna dla osób na wózku'
                    }
                    className="text-amber-600 dark:text-amber-400"
                  >
                    <AccessibleIcon size={18} />
                  </span>
                )}
              </div>
              {activeMember !== null && (
                <p className="mt-0.5 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  Słupek {slupekNumber(activeMember)}
                  {activeMember.street !== null && <span className="text-text-secondary"> · {activeMember.street}</span>}
                </p>
              )}
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

        {members.length > 1 && (
          <section className="glass rounded-2xl p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Słupki tego przystanku · {members.length}
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              To zespół osobnych słupków — każdy z własnymi liniami i kierunkiem.
              Wybierz słupek, z którego wsiadasz lub wysiadasz.
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setSlupekChoice(null)}
                aria-pressed={effSlupek === null}
                className="rounded-xl border px-3 py-2 text-left text-xs transition"
                style={
                  effSlupek === null
                    ? { background: 'var(--accent-gradient)', borderColor: 'transparent', color: '#fff' }
                    : { borderColor: 'var(--surface-border)' }
                }
              >
                Cały przystanek — wszystkie słupki razem
              </button>
              {members.map((member) => {
                const on = effSlupek === member.id
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setSlupekChoice(member.id)}
                    aria-pressed={on}
                    className="flex items-baseline gap-2 rounded-xl border px-3 py-2 text-left transition"
                    style={
                      on
                        ? { background: 'var(--accent-gradient)', borderColor: 'transparent', color: '#fff' }
                        : { borderColor: 'var(--surface-border)' }
                    }
                  >
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      Słupek {slupekNumber(member)}
                    </span>
                    {member.street !== null && (
                      <span className={on ? 'text-white/80 text-xs' : 'text-text-muted text-xs'}>{member.street}</span>
                    )}
                    <span className={`ml-auto shrink-0 text-[11px] ${on ? 'text-white/90' : 'text-text-secondary'}`}>
                      {member.lines.map((l) => l.line).join(' · ')}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Linie" value={summary ? String(summary.lineCount) : '—'} />
          <SummaryCard label="Odjazdy dziś" value={summary ? String(summary.departuresToday) : '—'} hint="wg rozkładu" />
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

          <TransitDepartureList
            departures={departures}
            loading={loading}
            city={city}
            showSlupek={activeMember === null && members.length > 1}
          />
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <CityWeatherCard city={city} />

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
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lines.map((line) => (
                      <span key={line.routeId} className="inline-flex items-center gap-1">
                        <LineBadge
                          line={line.line}
                          color={line.color}
                          mode={line.mode}
                          size="sm"
                          href={`/miasto/${city}/linia/${encodeURIComponent(line.routeId)}`}
                        />
                        {LINE_KIND_LABEL[line.kind] !== '' && (
                          <span className="text-[10px] text-text-muted">{LINE_KIND_LABEL[line.kind]}</span>
                        )}
                      </span>
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
