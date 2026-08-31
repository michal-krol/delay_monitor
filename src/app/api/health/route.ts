import { NextResponse } from 'next/server'
import { appConfig, poller } from '@/lib/board/instance'

/**
 * Ścieżka healthchecku Railway (`railway.json`) — czyta wyłącznie pamięć
 * procesu, nigdy nie woła PKP i nie może rzucić. Zasila też panel
 * diagnostyczny w pasku bocznym (środowiska deweloperskie, patrz
 * `PollerDiagnostics.tsx`), stąd stan pollera i budżet w tej samej
 * odpowiedzi — bez ani jednego dodatkowego zapytania do PKP (AGENTS.md #3:
 * budżet i tak przyjeżdża w nagłówkach odpowiedzi `/operations`).
 */
export async function GET() {
  return NextResponse.json({
    dataSource: appConfig.dataSource,
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
