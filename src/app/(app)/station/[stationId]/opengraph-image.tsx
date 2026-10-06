import { resolveRailCard } from '@/lib/share/card'
import { liveLookups } from '@/lib/share/lookups'
import { SHARE_ALT, SHARE_CONTENT_TYPE, SHARE_SIZE, renderShareImage } from '@/lib/share/render'

export const size = SHARE_SIZE
export const alt = SHARE_ALT
export const contentType = SHARE_CONTENT_TYPE

// Tylko `params` — `?name=` i reszta URL-a nie docierają tu i nie mogą trafić na kartę (AGENTS.md #4).
export default async function Image({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params
  return renderShareImage(await resolveRailCard(stationId, liveLookups))
}
