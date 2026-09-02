import { NextResponse } from 'next/server'
import { appConfig, poller } from '@/lib/board/instance'
import { loadConfig } from '@/lib/config'
import { enabledGtfsCities, peekGtfsPoller } from '@/lib/gtfs/instance'

/**
 * Ścieżka healthchecku Railway (`railway.json`) — czyta wyłącznie pamięć
 * procesu, nigdy nie woła PKP i nie może rzucić. Zasila też panel
 * diagnostyczny w pasku bocznym (środowiska deweloperskie, patrz
 * `PollerDiagnostics.tsx`), stąd stan pollera i budżet w tej samej
 * odpowiedzi — bez ani jednego dodatkowego zapytania do PKP (AGENTS.md #3:
 * budżet i tak przyjeżdża w nagłówkach odpowiedzi `/operations`).
 */
export async function GET() {
  const gtfsConfig = loadConfig().gtfs
  // Sekcja GTFS per miasto — sam ODCZYT stanu pollera, nie budzi ładowania.
  // `droppedRows` trójstanowo: `null` = nigdy nie parsowano, NIGDY jako `0`.
  const gtfs = gtfsConfig.enabled
    ? {
        dataSource: gtfsConfig.dataSource,
        cities: Object.fromEntries(
          enabledGtfsCities().map((city) => {
            const view = peekGtfsPoller(city.id)?.getView() ?? null
            return [
              city.id,
              view === null
                ? { state: 'idle' as const, loadedAt: null, feedVersion: null, droppedRows: null, phase: null }
                : {
                    state: view.state,
                    loadedAt: view.loadedAt,
                    ageMs: view.ageMs,
                    feedVersion: view.feedVersion,
                    droppedRows: view.droppedRows,
                    phase: view.phase,
                  },
            ]
          })
        ),
      }
    : { enabled: false }

  return NextResponse.json({
    dataSource: appConfig.dataSource,
    gtfs,
    pollerAwake: poller.isAwake(),
    pollerStatus: poller.getStatus(),
    throttled: poller.isThrottled(),
    intervalMs: poller.getIntervalMs(),
    // `undefined` (brak jeszcze pierwszego przebiegu) musi dojechać jako
    // jawny `null`, nie zniknąć z JSON-a — „nie wiadomo" to informacja.
    budget: poller.getBudget() ?? null,
    // Stan każdego źródła osobno. `pollerStatus` wyżej miesza w jednym polu
    // awarię `/operations`, zamrożony feed i 401, a o `/schedules`
    // i `/disruptions` milczy zupełnie — ich awarie degradują cicho. Podczas
    // pięciodniowej awarii PKP z aplikacji nie dało się odczytać, KTÓRE źródło
    // zawodzi (patrz `PollerDiagnostics` w `board/poller.ts`).
    feeds: poller.getDiagnostics(),
  })
}
