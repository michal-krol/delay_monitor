import { NextResponse } from 'next/server'
import { client, rememberStationName } from '@/lib/board/instance'

const MAX_SUGGESTIONS = 10

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim()

  if (query === '') {
    return NextResponse.json({ stations: [] })
  }

  const stations = await client.searchStations(query)
  for (const station of stations) {
    rememberStationName(station.id, station.name)
  }

  return NextResponse.json({ stations: stations.slice(0, MAX_SUGGESTIONS) })
}
