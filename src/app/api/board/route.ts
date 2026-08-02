import { NextResponse } from 'next/server'
import { poller } from '@/lib/board/instance'

/**
 * Identyfikatory stacji w API PKP są liczbami (schemat sprowadza je do stringów
 * przez `z.coerce.string()`). Trzymamy się tego formatu ściśle: identyfikator
 * trafia do zapytania kierowanego do PKP, więc wszystko poza cyframi to albo
 * pomyłka, albo próba wstrzyknięcia parametrów.
 */
const STATION_ID_PATTERN = /^\d{1,10}$/

/**
 * Górny limit obserwowanych stacji na żądanie. Realny użytkownik ma ich kilka;
 * bez limitu `stations=1,2,…,10000` rozdmuchuje mapę `interest` w pollerze
 * i długość URL-a wysyłanego do PKP.
 */
const MAX_STATIONS = 20

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stationsParam = searchParams.get('stations')

  if (!stationsParam) {
    return NextResponse.json({ error: 'Brak parametru stations' }, { status: 400 })
  }

  const rawIds = stationsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (rawIds.length === 0) {
    return NextResponse.json({ error: 'Brak parametru stations' }, { status: 400 })
  }

  if (rawIds.length > MAX_STATIONS) {
    return NextResponse.json(
      { error: `Za dużo stacji naraz (maksymalnie ${MAX_STATIONS})` },
      { status: 400 }
    )
  }

  const invalid = rawIds.find((id) => !STATION_ID_PATTERN.test(id))
  if (invalid !== undefined) {
    // Bez echa wartości w odpowiedzi — nie odbijamy wejścia użytkownika.
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator stacji' }, { status: 400 })
  }

  // Duplikaty w parametrze nie mogą zwielokrotniać wpisów w pollerze ani
  // wydłużać zapytania do PKP.
  const stationIds = [...new Set(rawIds)]

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
