import { NextResponse } from 'next/server'
import { client, rememberStationName } from '@/lib/board/instance'
import { PkpApiError } from '@/lib/pkp/client'

const MAX_SUGGESTIONS = 10

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim()

  if (query === '') {
    return NextResponse.json({ stations: [] })
  }

  try {
    const stations = await client.searchStations(query)
    for (const station of stations) {
      rememberStationName(station.id, station.name)
    }

    return NextResponse.json({ stations: stations.slice(0, MAX_SUGGESTIONS) })
  } catch (err) {
    // Awaria słownika stacji nie może wywrócić route handlera nieobsłużonym
    // wyjątkiem. Odpowiadamy jawnym błędem, żeby wyszukiwarka mogła odróżnić
    // "nie ma takiej stacji" od "nie udało się sprawdzić".
    console.error('GET /api/stations: pobranie listy stacji nie powiodło się', err)

    const status = err instanceof PkpApiError && err.status === 401 ? 502 : 503
    return NextResponse.json({ stations: [], error: 'Nie udało się pobrać listy stacji' }, { status })
  }
}
