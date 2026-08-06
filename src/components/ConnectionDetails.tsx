'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { DelayBadge } from './DelayBadge'
import { resolveStopStatus } from '@/lib/board/realization'

type TrainDetailApiStop = {
  stationId: string
  stationName: string
  plannedArrival: string | null
  actualArrival: string | null
  arrivalDelayMinutes: number | null
  plannedDeparture: string | null
  actualDeparture: string | null
  departureDelayMinutes: number | null
  isCancelled: boolean
  isConfirmed: boolean
  platform: string | null
}

type TrainDetailApiResponse = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainStatus: string | null
  carrierCode: string | null
  category: string | null
  routeName: string | null
  stops: TrainDetailApiStop[]
}

type Props = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainLabel: string
  onClose: () => void
}

type Status = 'loading' | 'error' | 'ready'

/**
 * Jeden "przystanek" w tym widoku łączy przyjazd i odjazd — tu, i tylko tu,
 * trzeba wybrać, którym opóźnieniem się kierować (odjazdowe pierwsze: to ono
 * decyduje, czy podróż stąd dalej rusza planowo). Sam wynik "czy to się już
 * wydarzyło" idzie do współdzielonego `resolveStopStatus` — ta sama funkcja
 * co w `board/transform.ts`, żeby te dwa widoki nie mogły się już rozjechać.
 */
function stopDelayMinutes(stop: TrainDetailApiStop): number | null {
  return stop.departureDelayMinutes ?? stop.arrivalDelayMinutes
}

function formatTime(value: string | null): string | null {
  if (value === null) return null
  return new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

export function ConnectionDetails({ scheduleId, orderId, operatingDate, trainLabel, onClose }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<TrainDetailApiResponse | null>(null)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const params = new URLSearchParams({ scheduleId, orderId, operatingDate })
        const response = await fetch(`/api/train?${params}`)
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json = (await response.json()) as TrainDetailApiResponse
        if (!cancelled) {
          setData(json)
          setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [scheduleId, orderId, operatingDate])

  useEffect(() => {
    panelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      data-testid="connection-details-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* max-h + flex-col: nagłówek (tytuł, licznik, Zamknij) ma stały rozmiar
          i zawsze zostaje widoczny; przewija się tylko lista przystanków niżej
          (flex-1 overflow-y-auto) — trasa potrafi mieć 30-40 stacji. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass-strong flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {data?.routeName ?? trainLabel}
            </h2>
            {status === 'ready' && data !== null && (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{data.stops.length} przystanków</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-white/60 px-3.5 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-black/10 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-white/10 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/15"
          >
            Zamknij
          </button>
        </div>

        {status === 'loading' && (
          <p className="px-5 pb-5 text-sm text-gray-500 dark:text-gray-400">Wczytywanie trasy…</p>
        )}

        {status === 'error' && (
          <p role="alert" className="px-5 pb-5 text-sm text-red-700 dark:text-red-300">
            Nie udało się pobrać szczegółów połączenia.
          </p>
        )}

        {status === 'ready' && data !== null && (
          <ol className="flex-1 space-y-0 overflow-y-auto px-5 pb-5">
            {data.stops.map((stop, index) => {
              // Oparte na fakcie przyjazdu/odjazdu (planowym LUB faktycznym), nie
              // tylko planowym — pociąg bez dopasowanej trasy (patrz trainDetail.ts)
              // ma plannedArrival/plannedDeparture zawsze null, ale wciąż zna
              // faktyczne czasy i nie może przez to zniknąć z widoku.
              const hasArrival = stop.plannedArrival !== null || stop.actualArrival !== null
              const hasDeparture = stop.plannedDeparture !== null || stop.actualDeparture !== null
              const isTerminus = !hasArrival || !hasDeparture
              const arrival = formatTime(stop.actualArrival ?? stop.plannedArrival)
              const departure = formatTime(stop.actualDeparture ?? stop.plannedDeparture)
              return (
                <li
                  key={stop.stationId}
                  className={`border-l-2 border-black/10 py-2.5 pl-4 dark:border-white/10 ${
                    index === data.stops.length - 1 ? '' : 'border-b border-b-black/5 dark:border-b-white/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`font-medium text-gray-900 dark:text-gray-100 ${isTerminus ? '' : 'text-sm'}`}
                    >
                      {stop.stationName}
                    </span>
                    <DelayBadge
                      status={resolveStopStatus({
                        isCancelled: stop.isCancelled,
                        isConfirmed: stop.isConfirmed,
                        delayMinutes: stopDelayMinutes(stop),
                      })}
                      delayMinutes={stopDelayMinutes(stop)}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                    {hasArrival && <span>Przyjazd {arrival}</span>}
                    {hasDeparture && <span>Odjazd {departure}</span>}
                    {stop.platform !== null && <span>Peron/tor {stop.platform}</span>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
