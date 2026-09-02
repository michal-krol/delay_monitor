'use client'

import { notFound, useParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { TransitDepartureList } from '@/components/TransitDepartureList'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { LineBadge } from '@/components/LineBadge'
import { favouriteKey, useFavourites, type Favourite } from '@/hooks/useFavourites'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN } from '@/lib/validation'
import { StarIcon } from '@/components/icons'

const MODE_LABEL = { metro: 'metro', tram: 'tramwaj', bus: 'autobus', rail: 'kolej strefowa', other: 'inne' } as const

export default function TransitStopPage() {
  const params = useParams<{ city: string; stopId: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const stopId = typeof params.stopId === 'string' ? params.stopId : ''

  if (!CITY_ID_PATTERN.test(city) || !GTFS_STOP_ID_PATTERN.test(stopId)) {
    notFound()
  }

  const router = useRouter()
  const { isFavourite, addFavourite, removeFavourite } = useFavourites()
  const { data, error } = useTransitBoard(city, [stopId])

  const board = data?.stops[0] ?? null
  const stopName = board?.name ?? stopId
  const favourite: Favourite = { kind: 'gtfs', city, id: stopId, name: stopName }
  const key = favouriteKey(favourite)
  const pinned = isFavourite(key)

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
      <TopBar backLabel="Wróć do miasta" onBack={() => router.push(`/miasto/${city}`)} />

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{stopName}</h1>
            {board !== null && board.modes.length > 0 && (
              <p className="mt-1 text-sm text-text-secondary">{board.modes.map((mode) => MODE_LABEL[mode]).join(' · ')}</p>
            )}
            {data !== null && (
              <div className="mt-2">
                <ScheduleStatus schedule={data.schedule} cityName={city} error={error !== null} />
              </div>
            )}
          </div>
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

        <TransitDepartureList
          departures={board?.departures ?? []}
          loading={data === null && error === null}
        />

        {board !== null && board.departures.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[...new Map(board.departures.map((d) => [d.routeId, d])).values()].map((departure) => (
              <LineBadge
                key={departure.routeId}
                line={departure.line}
                color={departure.color}
                mode={departure.mode}
                size="sm"
              />
            ))}
          </div>
        )}

        <AttributionFooter attribution={data?.attribution ?? []} />
      </section>
    </main>
  )
}
