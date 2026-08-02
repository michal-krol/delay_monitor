import { NextResponse } from 'next/server'
import { poller } from '@/lib/board/instance'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stationsParam = searchParams.get('stations')

  if (!stationsParam) {
    return NextResponse.json({ error: 'Brak parametru stations' }, { status: 400 })
  }

  const stationIds = stationsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (stationIds.length === 0) {
    return NextResponse.json({ error: 'Brak parametru stations' }, { status: 400 })
  }

  poller.registerInterest(stationIds)

  const now = Date.now()
  const snapshots = stationIds.map((stationId) => {
    const snapshot = poller.getSnapshot(stationId)
    if (!snapshot) return null
    return {
      ...snapshot,
      ageMs: now - new Date(snapshot.fetchedAt).getTime(),
    }
  })

  return NextResponse.json({
    snapshots,
    budget: poller.getBudget(),
    status: poller.getStatus(),
    throttled: poller.isThrottled(),
  })
}
