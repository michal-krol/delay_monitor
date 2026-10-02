'use client'

import { useId } from 'react'
import Link from 'next/link'
import { recentPlaceHref, recentPlaceKey, useRecentPlaces } from '@/hooks/useRecentPlaces'
import { ICON_SIZE, StopIcon, TrainIcon } from './icons'

/** „Ostatnio oglądane" stacje i przystanki (z `localStorage`); nic nie renderuje, dopóki lista jest nieznana lub pusta. */
export function RecentPlaces({ limit, headingLevel = 'h2' }: { limit: number; headingLevel?: 'h2' | 'h3' }) {
  const { places, loaded, clear } = useRecentPlaces()
  const headingId = useId()
  if (!loaded || places.length === 0) return null

  const Heading = headingLevel
  return (
    <section aria-labelledby={headingId} className="mt-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Heading id={headingId} className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          Ostatnio oglądane
        </Heading>
        <button
          type="button"
          onClick={clear}
          className="touch-44 relative rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10"
        >
          Wyczyść
        </button>
      </div>
      <ul className="mt-1">
        {places.slice(0, limit).map((place) => {
          const Icon = place.kind === 'pkp' ? TrainIcon : StopIcon
          return (
            <li key={recentPlaceKey(place)}>
              <Link
                href={recentPlaceHref(place)}
                className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-foreground transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10"
              >
                <Icon size={ICON_SIZE.button} className="shrink-0 opacity-70" />
                <span className="min-w-0 truncate">{place.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
