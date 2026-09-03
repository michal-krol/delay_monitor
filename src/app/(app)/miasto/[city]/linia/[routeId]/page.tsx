'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { LineBadge } from '@/components/LineBadge'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { AccessibleIcon, ArrowRightIcon } from '@/components/icons'
import { MODE_LABEL } from '@/components/transitMode'
import { useCityName } from '@/hooks/useCityName'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import type { LineDetail } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'

type LineResponse = {
  city: string
  schedule: TransitBoardResponse['schedule']
  line: LineDetail | null
  attribution: string[]
}

const LOADING_RETRY_MS = [1000, 2000, 3000, 5000, 8000, 15000]
const KIND_LABEL = { regular: '', night: 'linia nocna', express: 'linia przyspieszona', replacement: 'linia zastępcza' } as const

export default function LineDetailPage() {
  const params = useParams<{ city: string; routeId: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const routeId = typeof params.routeId === 'string' ? params.routeId : ''

  if (!CITY_ID_PATTERN.test(city) || !GTFS_ROUTE_ID_PATTERN.test(routeId)) {
    notFound()
  }

  const router = useRouter()
  const cityName = useCityName(city)
  const [data, setData] = useState<LineResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let retry = 0

    function tick(): void {
      fetch(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((json: LineResponse) => {
          if (cancelled) return
          setData(json)
          setFailed(false)
          if (json.line === null && json.schedule.state === 'loading' && retry < LOADING_RETRY_MS.length) {
            timer = setTimeout(tick, LOADING_RETRY_MS[retry++])
          }
        })
        .catch(() => {
          if (!cancelled) setFailed(true)
        })
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [city, routeId])

  const line = data?.line ?? null
  const loading = data === null && !failed

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
      <TopBar backLabel="Wróć do linii" onBack={() => router.push(`/miasto/${city}/linie`)} />

      {line !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <LineBadge line={line.line} color={line.color} mode={line.mode} />
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{line.longName}</h1>
          </div>
          <p className="text-sm text-text-secondary">
            {MODE_LABEL[line.mode]}
            {KIND_LABEL[line.kind] !== '' && <span className="text-text-muted"> · {KIND_LABEL[line.kind]}</span>}
          </p>
          {data !== null && <ScheduleStatus schedule={data.schedule} cityName={cityName} error={failed} />}
        </div>
      )}

      {failed && data === null ? (
        <p className="text-sm text-red-700 dark:text-red-300">Nie udało się pobrać przebiegu linii.</p>
      ) : loading ? (
        <p className="text-sm text-text-secondary">Wczytuję przebieg linii…</p>
      ) : line === null ? (
        <p className="text-sm text-text-secondary">
          {data?.schedule.state === 'loading' ? 'Rozkład jeszcze się wczytuje.' : 'Nie znaleziono takiej linii w rozkładzie.'}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {line.directions.map((direction) => (
            <section key={direction.directionId} className="glass rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <ArrowRightIcon size={15} className="text-text-muted" />
                {direction.headsign ?? `Kierunek ${direction.directionId + 1}`}
              </h2>
              <ol className="mt-3 flex flex-col">
                {direction.stops.map((stop, index) => (
                  <li key={`${stop.stopId}-${index}`} className="border-t py-2 first:border-t-0" style={{ borderColor: 'var(--surface-border)' }}>
                    <Link
                      href={`/miasto/${city}/przystanek/${encodeURIComponent(stop.groupId)}?nazwa=${encodeURIComponent(stop.name)}`}
                      className="flex items-center gap-2 text-sm text-foreground hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      <span className="flex-1">{stop.name}</span>
                      {stop.wheelchair === 1 && <AccessibleIcon size={14} className="shrink-0 text-text-muted" />}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {data !== null && <AttributionFooter attribution={data.attribution} />}
    </main>
  )
}
