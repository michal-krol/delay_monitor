import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { resolveStopCard } from '@/lib/share/card'
import { liveLookups } from '@/lib/share/lookups'
import { cardMetadata } from '@/lib/share/metadata'

export async function generateMetadata({ params }: { params: Promise<{ city: string; stopId: string }> }): Promise<Metadata> {
  const { city, stopId } = await params
  return cardMetadata(await resolveStopCard(city, stopId, liveLookups))
}

export default function StopLayout({ children }: { children: ReactNode }) {
  return children
}
