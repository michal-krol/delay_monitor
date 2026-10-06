import { resolveStopCard } from '@/lib/share/card'
import { liveLookups } from '@/lib/share/lookups'
import { SHARE_ALT, SHARE_CONTENT_TYPE, SHARE_SIZE, shareImageResponse } from '@/lib/share/render'

export const size = SHARE_SIZE
export const alt = SHARE_ALT
export const contentType = SHARE_CONTENT_TYPE

// Tylko `params` — `?name=` nie dociera tu i nie może trafić na kartę (AGENTS.md #4).
export default async function Image({ params }: { params: Promise<{ city: string; stopId: string }> }) {
  const { city, stopId } = await params
  return shareImageResponse(await resolveStopCard(city, stopId, liveLookups))
}
