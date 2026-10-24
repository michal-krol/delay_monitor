'use client'

import { useId } from 'react'
import Link from 'next/link'
import { DelayBadge, STATUS_TEXT, TOKENS } from './DelayBadge'
import { AlertCircleIcon, ChevronRightIcon, DisclosureIcon, InfoIcon, PauseIcon, VehiclePositionIcon, ICON_SIZE } from './icons'
import { describeStopTime, stopEvent } from './stopTime'
import type { RealizationStatus } from '@/lib/board/realization'
import { resolveCurrentStopIndex, type PositionAnchor } from '@/lib/board/trainDetail'
import type { TrainDetailStopWithCoords } from '@/lib/board/mapPosition'
import { collapsedStopRange } from '@/lib/board/routeWindow'
import { stopDelayMinutes } from '@/lib/board/journey'
import { formatClockTime } from '@/lib/format'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'
import { pluralPl } from '@/lib/plural'
import { STATION_ID_PATTERN } from '@/lib/validation'

type Props = {
  stops: TrainDetailStopWithCoords[]
  /** Status per przystanek z `resolveStopStatus` (liczy rodzic) — jedyne źródło koloru kropki, odcinka i tekstu. */
  statuses: RealizationStatus[]
  anchor: PositionAnchor
  /** „Teraz” z zegara rodzica (ms) — tylko do odliczania w `describeStopTime`, zero zapytań. */
  now: number
  expanded: boolean
  onToggle: () => void
}

/**
 * Próg, od którego postój dostaje własną plakietkę. Na żywym API (475 tras, 8380 przystanków) 4880 z 7173 postojów
 * trwa dokładnie minutę — plakietka bez progu wisiałaby przy prawie każdym wierszu i przestałaby cokolwiek znaczyć.
 */
const NOTABLE_STOP_MINUTES = 3

/**
 * „Peron 3 · tor 1”, sam „Peron 3” albo sam „Tor 1” — puste, gdy nie znamy żadnego. Peron i tor to dwie niezależne
 * wartości (jedna bywa znana bez drugiej), więc nie sklejamy ich w „3/1”. Jeden ciąg, nie kilka węzłów tekstowych.
 */
function formatPlatformTrack(platformRaw: string | null, trackRaw: string | null): string {
  // Pusty ciąg albo same spacje = nieznane (nie „Peron ”).
  const platform = platformRaw?.trim() || null
  const track = trackRaw?.trim() || null
  if (platform !== null && track !== null) return `Peron ${platform} · tor ${track}`
  if (platform !== null) return `Peron ${platform}`
  if (track !== null) return `Tor ${track}`
  return ''
}

/**
 * Przebieg trasy: jeden układ na każdej szerokości (kropka + odcinek | nazwa, peron/tor | godzina i podpis). Czysta
 * prezentacja: statusy i kotwica przychodzą z rodzica (`resolveStopStatus`, `resolvePositionAnchor`), godziny z
 * `describeStopTime`. Skrót długiej trasy to lokalny stan rodzica — rozwinięcie nie robi żadnego zapytania (#3).
 */
export function TrainRouteList({ stops, statuses, anchor, now, expanded, onToggle }: Props) {
  const listId = useId()
  const scheduleMode = anchor.mode === 'schedule'
  const staleProjection = anchor.mode === 'stale'
  const range = collapsedStopRange({
    stopCount: stops.length,
    confirmedIndex: resolveCurrentStopIndex(stops),
    anchorIndex: anchor.index,
  })
  const collapsed = range !== null && !expanded
  const firstShown = collapsed ? range.from : 0
  const lastShown = collapsed ? range.to : stops.length - 1

  return (
    <>
      {/* Pionowy stepper: kolumna znacznika ma `flex-direction: column`, więc każdy wiersz sam rysuje swój odcinek
          „szyny” do następnego przystanku (kropka = status TEGO przystanku, odcinek pod nią = status NASTĘPNEGO).
          `@container`, nie breakpoint okna: szerokość wiersza zależy od paska bocznego, nie od szerokości ekranu. */}
      <ol id={listId} className="@container mt-4" aria-label="Przebieg trasy">
        {stops.map((stop, index) => {
          if (index < firstShown || index > lastShown) return null

          const isFirst = index === 0
          const isLast = index === stops.length - 1
          const isCurrent = index === anchor.index
          const status = statuses[index]
          const nextStatus = statuses[index + 1]
          // Ostatni przystanek to zawsze przyjazd (jak „Przyjazd do celu” w nagłówku), nawet gdy PKP podaje też odjazd.
          const event = isLast ? 'arrival' : stopEvent(stop)
          const time = describeStopTime(stop, status, now, event)
          const filled = stop.isConfirmed && !stop.isCancelled
          const platformTrack = formatPlatformTrack(stop.platform, stop.track)
          // `?? null`/`?? []` — odpowiedź API zawsze niesie te pola, ale ręczne literały w starszych testach mogą ich
          // nie mieć wcale, a `undefined !== null` przepuściłoby pustą plakietkę.
          const messages = stop.disruptionMessages ?? []
          const stopTypeName = stop.stopTypeName ?? null
          const stopMinutes = stop.stopMinutes ?? null
          const showStopMinutes = stopMinutes !== null && stopMinutes >= NOTABLE_STOP_MINUTES
          const hasBadges = isCurrent || showStopMinutes || stopTypeName !== null || messages.length > 0
          // Odjazd/przyjazd mówi etykieta przy godzinie — drugi podpis przy nazwie byłby powtórzeniem.
          const name = <span className={`${isFirst || isLast ? 'font-semibold' : 'font-medium'} break-words text-foreground`}>{stop.stationName}</span>

          // Klucz z indeksem, nie sam `stationId`: pociąg z zawrotką mija tę samą stację dwa razy (np. PODLASIAK:
          // Szczecin Dąbie) — bez indeksu React myli oba wiersze przy odświeżaniu danych w tle.
          return (
            <li key={`${stop.stationId}-${index}`} aria-current={isCurrent ? 'step' : undefined} className="flex gap-3.5">
              <div className="flex flex-col items-center pt-[1.1875rem]">
                {/* Pełna kropka = potwierdzony (`isConfirmed`, #2), pusty pierścień = przyszły albo odwołany; kolor to
                    status. Halo (statyczne, bez pętli) tylko tam, gdzie pociąg właśnie jest. */}
                <span
                  data-testid="stop-dot"
                  data-dot={filled ? 'filled' : 'hollow'}
                  className="box-border h-3 w-3 shrink-0 rounded-full border-2"
                  style={{
                    borderColor: TOKENS[status].bg,
                    backgroundColor: filled ? TOKENS[status].bg : 'transparent',
                    boxShadow: isCurrent ? '0 0 0 4px color-mix(in srgb, var(--status-enRoute-bg) 25%, transparent)' : undefined,
                  }}
                  aria-hidden="true"
                />
                {!isLast && <span className="mt-1.5 w-0.5 flex-1" style={{ backgroundColor: TOKENS[nextStatus].bg }} aria-hidden="true" />}
              </div>

              <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-3'}`}>
                <div
                  data-current={isCurrent ? '' : undefined}
                  className="rounded-xl border border-transparent px-2.5 py-0.5 transition-colors duration-[var(--duration-base)] motion-reduce:transition-none"
                  style={
                    isCurrent
                      ? {
                          borderColor: 'color-mix(in srgb, var(--status-enRoute-bg) 55%, transparent)',
                          // 10% przyciemniało wiersz na tyle, że tekst statusu spadał do 3,99:1 (zmierzone). 6% zostawia
                          // widoczne podświetlenie i nie zjada kontrastu — ciężar niesie ramka.
                          backgroundColor: 'color-mix(in srgb, var(--status-enRoute-bg) 6%, transparent)',
                        }
                      : undefined
                  }
                >
                  {/* Wąski kontener (telefon): czas pod nazwą, wyrównany do lewej — nazwa dostaje całą szerokość; od `@md` czas jedzie w prawą kolumnę. */}
                  <div className="flex flex-col @md:flex-row @md:items-start @md:justify-between @md:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-h-11 items-center">
                        {STATION_ID_PATTERN.test(stop.stationId) ? (
                          <Link
                            href={`/station/${stop.stationId}?name=${encodeURIComponent(stop.stationName)}`}
                            transitionTypes={NAV_FORWARD_TYPES}
                            className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                          >
                            <span className="min-w-0">{name}</span>
                            <ChevronRightIcon size={ICON_SIZE.button} className="shrink-0 text-text-muted" />
                          </Link>
                        ) : (
                          <span className="min-w-0">{name}</span>
                        )}
                        {filled && <span className="sr-only">Potwierdzony</span>}
                      </div>
                      {/* Peron i tor to dwie niezależne wartości — własne słowa, nic gdy nie znamy żadnej (nie „—”). */}
                      {platformTrack !== '' && <p className="-mt-1 text-sm text-text-secondary tabular-nums">{platformTrack}</p>}
                    </div>

                    <div className="pb-1 text-left tabular-nums @md:shrink-0 @md:pt-2 @md:pb-0 @md:text-right">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 @md:justify-end">
                        <span className="text-xs text-text-muted">{event === 'departure' ? 'Odjazd' : 'Przyjazd'}</span>
                        <span
                          className={`text-lg font-semibold ${time.kind === 'plan' ? 'text-foreground' : ''}`}
                          style={time.kind === 'plan' ? undefined : { color: STATUS_TEXT[status] }}
                        >
                          {time.at !== null ? formatClockTime(time.at) : '—'}
                        </span>
                        <span className="text-xs font-semibold text-text-secondary">
                          {time.label === 'Przew.' ? <abbr title="Przewidywana">Przew.</abbr> : time.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-1.5 @md:justify-end">
                        {time.planAt !== null && <span className="text-sm text-text-muted">Plan {formatClockTime(time.planAt)}</span>}
                        <DelayBadge
                          status={status}
                          delayMinutes={stopDelayMinutes(stop)}
                          // Ostatni przystanek to tylko przyjazd -> „jeszcze nie przyjechał”; wcześniejsze wiersz opisuje odjazdowo.
                          direction={isLast ? 'arrival' : 'departure'}
                          estimatedDelayMinutes={stop.estimatedDelayMinutes}
                          variant="text"
                        />
                      </div>
                    </div>
                  </div>

                  {hasBadges && (
                    <div className="mt-1 mb-1 flex flex-wrap items-center gap-1.5">
                      {isCurrent && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: 'var(--status-enRoute-bg)', color: 'var(--status-enRoute-fg)' }}
                        >
                          <VehiclePositionIcon size={ICON_SIZE.inline} />
                          {scheduleMode
                            ? 'Szacowana pozycja — wg rozkładu'
                            : staleProjection
                              ? 'Szacowana pozycja — rozkład i ostatnie potwierdzenie'
                              : 'Pociąg jest tutaj'}
                        </span>
                      )}
                      {showStopMinutes && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-surface-border px-2 py-0.5 text-xs text-text-secondary">
                          <PauseIcon size={ICON_SIZE.inline} />
                          Postój {stopMinutes} min
                        </span>
                      )}
                      {stopTypeName !== null && (
                        // Ograniczenie postoju („tylko dla wysiadających”), nie utrudnienie: neutralny chip jak „Postój”,
                        // bo amber + AlertCircle to wyłącznie „Utrudnienie” obok.
                        <span className="inline-flex items-center gap-1 rounded-full border border-surface-border px-2 py-0.5 text-xs text-text-secondary">
                          <InfoIcon size={ICON_SIZE.inline} />
                          {stopTypeName}
                        </span>
                      )}
                      {messages.length > 0 && (
                        <details className="w-full">
                          {/* Cel dotyku 44 px (`min-h-11`), pigułka wizualnie niska: `-my-2` oddaje wysokość układowi. */}
                          <summary className="-my-2 inline-flex min-h-11 w-fit cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              <AlertCircleIcon size={ICON_SIZE.inline} />
                              Utrudnienie
                              <DisclosureIcon size={ICON_SIZE.chip} />
                            </span>
                          </summary>
                          <p className="mt-1.5 text-xs text-text-secondary">{messages.join(' ')}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {range !== null && (
        <button type="button" className="chip-filter mt-3 w-full gap-2" aria-expanded={expanded} aria-controls={listId} onClick={onToggle}>
          {expanded ? 'Zwiń trasę' : `Pokaż całą trasę (${stops.length} ${pluralPl(stops.length, 'przystanek', 'przystanki', 'przystanków')})`}
          <DisclosureIcon size={ICON_SIZE.button} />
        </button>
      )}
    </>
  )
}
