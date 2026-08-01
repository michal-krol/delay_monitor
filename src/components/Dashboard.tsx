'use client'

import { StationCard } from './StationCard'
import type { StationOption } from './StationSearch'
import type { Favourite } from '@/hooks/useFavourites'

type Props = {
  favourites: Favourite[]
  onExpand: (station: StationOption) => void
}

export function Dashboard({ favourites, onExpand }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {favourites.map((favourite) => (
        <StationCard key={favourite.id} stationId={favourite.id} stationName={favourite.name} onExpand={onExpand} />
      ))}
    </div>
  )
}
