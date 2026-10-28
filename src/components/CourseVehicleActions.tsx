'use client'

import Link from 'next/link'
import { vehicleMapHref } from '@/lib/vehicleMapLink'
import { useNow } from '@/hooks/useNow'
import { HIDE_AFTER_SEC } from './map/mapData'
import { ICON_SIZE, PastScheduledDepartureIcon, VehicleMapIcon } from './icons'
import type { VehicleStopStatus } from '@/lib/gtfs/vehicleStatus'

/** Optional additions keep older snapshots usable without inferring a status from them. */
export type CourseVehicle = Partial<Pick<VehicleStopStatus, 'id' | 'tripId' | 'serviceDate' | 'sideNumber' | 'observedAt' | 'pastScheduledDeparture'>> & { ageSec: number }

/** A noninteractive status and a separate map link; their slots never change places. */
export function CourseVehicleActions({ city, vehicle, showStatus = true }: { city: string; vehicle: CourseVehicle | null | undefined; showStatus?: boolean }) {
  const now = useNow(10_000)
  const observedAt = vehicle?.observedAt === undefined ? NaN : Date.parse(vehicle.observedAt)
  const ageMs = now - observedAt
  const current = Number.isFinite(ageMs) && ageMs >= 0
  const onMap = current && ageMs <= HIDE_AFTER_SEC * 1000 && vehicle?.id && vehicle.tripId
  const pastScheduledDeparture = current && ageMs <= 60_000 && vehicle?.pastScheduledDeparture === true
  return (
    <span className={`flex shrink-0 items-center ${showStatus ? 'w-[88px]' : 'w-[44px]'}`}>
      {showStatus && <span className="flex min-h-[44px] w-[44px] shrink-0 items-center justify-center text-error-text">
        {pastScheduledDeparture && <span role="img" aria-label="Po planowanym odjeździe"><PastScheduledDepartureIcon size={ICON_SIZE.tile} /></span>}
      </span>}
      {onMap ? (
        <Link href={vehicleMapHref(city, { id: vehicle.id!, tripId: vehicle.tripId!, serviceDate: vehicle.serviceDate })} prefetch={false} className="press flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-primary-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary-text" aria-label={`Pokaż pojazd ${vehicle.sideNumber || vehicle.id} na mapie`}>
          <VehicleMapIcon size={ICON_SIZE.tile} />
        </Link>
      ) : <span className="min-h-[44px] w-[44px] shrink-0" aria-hidden="true" />}
    </span>
  )
}
