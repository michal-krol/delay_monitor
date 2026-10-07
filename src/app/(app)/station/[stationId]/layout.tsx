import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { resolveRailCard } from '@/lib/share/card'
import { liveLookups } from '@/lib/share/lookups'
import { cardMetadata } from '@/lib/share/metadata'

// Strona jest kliencka (`'use client'`) — metadane i obraz podglądu muszą żyć w serwerowym layoucie segmentu.
export async function generateMetadata({ params }: { params: Promise<{ stationId: string }> }): Promise<Metadata> {
  const { stationId } = await params
  return cardMetadata(await resolveRailCard(stationId, liveLookups))
}

export default function StationLayout({ children }: { children: ReactNode }) {
  return children
}
