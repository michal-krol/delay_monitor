import { NextResponse } from 'next/server'
import { poller } from '@/lib/board/instance'
import { railStationStatus, type RailStationStatus } from '@/lib/board/railStationStatus'
import { getMapRailStations } from '@/lib/weather/coordinates'

/**
 * Statusy stacji z warstwy kolei, które poller i tak ma w pamięci (ktoś
 * oglądał ich tablicę) — zwykle kilkadziesiąt z ~3 tys. WYŁĄCZNIE
 * `getSnapshot`, nigdy `registerInterest`: samo otwarcie/przesunięcie mapy nie
 * może wciągać stacji do budżetu PKP (AGENTS.md #3). Stacja bez snapshotu po
 * prostu nie występuje w odpowiedzi — klient pokazuje ją jako „nie wiadomo".
 */
export async function GET(): Promise<Response> {
  let stations
  try {
    stations = await getMapRailStations()
  } catch {
    return NextResponse.json({ error: 'Nie udało się wczytać listy stacji' }, { status: 500 })
  }
  const now = Date.now()
  const statuses: RailStationStatus[] = []
  for (const station of stations) {
    const snapshot = poller.getSnapshot(station.id)
    if (snapshot !== undefined) statuses.push(railStationStatus(snapshot, now))
  }
  return NextResponse.json({ stations: statuses })
}
