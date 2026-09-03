'use client'

import { useEffect, useMemo, useState } from 'react'
import { notFound, useParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { ModeFilter, type ModeValue } from '@/components/ModeFilter'
import { LineGrid } from '@/components/LineGrid'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { useCityName } from '@/hooks/useCityName'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN } from '@/lib/validation'

type LinesResponse = {
  city: string
  schedule: TransitBoardResponse['schedule']
  lines: Record<GtfsMode, LineListEntry[]> | null
  attribution: string[]
}

const LOADING_RETRY_MS = [1000, 2000, 3000, 5000, 8000, 15000]

export default function CityLinesPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const router = useRouter()
  const cityName = useCityName(city)
  const [data, setData] = useState<LinesResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<ModeValue>('all')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let retry = 0

    function tick(): void {
      fetch(`/api/gtfs/lines?city=${encodeURIComponent(city)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((json: LinesResponse) => {
          if (cancelled) return
          setData(json)
          setFailed(false)
          if (json.schedule.state === 'loading' && retry < LOADING_RETRY_MS.length) {
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
  }, [city])

  const lines = data?.lines ?? null
  const available = useMemo<GtfsMode[]>(
    () => (lines === null ? [] : (Object.keys(lines) as GtfsMode[]).filter((m) => lines[m].length > 0)),
    [lines]
  )
  const loading = data === null && !failed

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
      <TopBar backLabel="Wróć do miasta" onBack={() => router.push(`/miasto/${city}`)} />

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">Linie — {cityName}</h1>
        {data !== null && <ScheduleStatus schedule={data.schedule} cityName={cityName} error={failed} />}
      </div>

      {failed && data === null ? (
        <p className="text-sm text-red-700 dark:text-red-300">Nie udało się pobrać listy linii.</p>
      ) : loading ? (
        <p className="text-sm text-text-secondary">Wczytuję linie…</p>
      ) : lines === null ? (
        <p className="text-sm text-text-secondary">Rozkład jeszcze się wczytuje.</p>
      ) : (
        <>
          <ModeFilter available={available} value={mode} onChange={setMode} />
          <LineGrid linesByMode={lines} city={city} filter={mode} />
        </>
      )}

      {data !== null && <AttributionFooter attribution={data.attribution} />}
    </main>
  )
}
