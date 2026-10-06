import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { resolveLineCard } from '@/lib/share/card'
import { liveLookups } from '@/lib/share/lookups'
import { cardMetadata } from '@/lib/share/metadata'

export async function generateMetadata({ params }: { params: Promise<{ city: string; routeId: string }> }): Promise<Metadata> {
  const { city, routeId } = await params
  return cardMetadata(await resolveLineCard(city, routeId, liveLookups))
}

export default function LineLayout({ children }: { children: ReactNode }) {
  return children
}
