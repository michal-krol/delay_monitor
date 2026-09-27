import { NextResponse } from 'next/server'
import { getMapRailStations } from '@/lib/weather/coordinates'

/**
 * Wszystkie stacje kolejowe z prawdziwą pozycją (cała Polska) — statyczna
 * warstwa kolei mapy. Zero zapytań do PKP: plik `data/station-coordinates.json`.
 * Zmienia się tylko z wdrożeniem → cache przeglądarki 1 h. Awaria wczytania
 * pliku = 500 bez cache'u (następne żądanie spróbuje ponownie, #7).
 */
export async function GET(): Promise<Response> {
  try {
    const stations = await getMapRailStations()
    return NextResponse.json({ stations }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  } catch {
    return NextResponse.json({ error: 'Nie udało się wczytać listy stacji' }, { status: 500 })
  }
}
