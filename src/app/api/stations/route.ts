import { NextResponse } from 'next/server'
import { client, rememberStationName } from '@/lib/board/instance'
import { getCached, setCached } from '@/lib/pkp/stationSearchCache'

const MAX_SUGGESTIONS = 10

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim()

  if (query === '') {
    return NextResponse.json({ stations: [] })
  }

  const normalized = query.toLowerCase()
  const cached = getCached(normalized)
  if (cached) {
    return NextResponse.json({ stations: cached.slice(0, MAX_SUGGESTIONS) })
  }

  const stations = await client.searchStations(query)
  setCached(normalized, stations)
  for (const station of stations) {
    rememberStationName(station.id, station.name)
  }

  return NextResponse.json({ stations: stations.slice(0, MAX_SUGGESTIONS) })
}
