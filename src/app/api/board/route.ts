import { NextResponse } from 'next/server'
import { client, poller } from '@/lib/board/instance'
import { STATION_ID_PATTERN } from '@/lib/validation'

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

  // Poller odpytuje PKP o to, co mu podamy, więc nieznane identyfikatory nie
  // mogą do niego trafić — inaczej dowolny klient steruje tym, o co pytamy
  // zewnętrzne API, i zużywa nasz limit.
  //
  // Odsiewamy, zamiast odrzucać całe żądanie: jeden nieaktualny wpis
  // w ulubionych (np. przeniesiony z trybu mock) nie może wywrócić dashboardu.
  // Nieznana stacja dostaje w odpowiedzi `null`, dokładnie jak stacja bez danych.
  //
  // `getCachedStationIds()` czyta wyłącznie pamięć i nigdy nie wyzwala pobrania,
  // więc ten handler nadal nie czeka na PKP. Gdy słownik jeszcze nie jest
  // wczytany, zwraca `null` i walidację pomijamy — świadome „fail-open" na rzecz
  // dostępności; format, limit liczby i pula wymuszeń w pollerze nadal działają.
  const knownIds = client.getCachedStationIds()
  const watchable = knownIds === null ? stationIds : stationIds.filter((id) => knownIds.has(id))

  if (watchable.length > 0) {
    poller.registerInterest(watchable)
  }

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
