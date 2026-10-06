import { resolveLineCard } from '@/lib/share/card'
import { liveLookups } from '@/lib/share/lookups'
import { SHARE_ALT, SHARE_CONTENT_TYPE, SHARE_SIZE, shareImageResponse } from '@/lib/share/render'

export const size = SHARE_SIZE
export const alt = SHARE_ALT
export const contentType = SHARE_CONTENT_TYPE

// Tylko `params` — nic z URL-a poza id linii nie trafia na kartę (AGENTS.md #4).
export default async function Image({ params }: { params: Promise<{ city: string; routeId: string }> }) {
  const { city, routeId } = await params
  return shareImageResponse(await resolveLineCard(city, routeId, liveLookups))
}
